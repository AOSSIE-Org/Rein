import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { storeToken, isKnownToken, touchToken, generateToken, getActiveToken } from './tokenStore';
import { screen, mouse } from '@nut-tree-fork/nut-js';
import sharp from 'sharp';
import os from 'os';
import fs from 'fs';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import logger from '../utils/logger';

/** Per-connection mirror state managed via WeakMap to avoid monkey-patching WebSocket. */
interface MirrorState {
    frameInProgress: boolean;
    frameW: number;
    frameH: number;
    logScreenW: number;
    logScreenH: number;
    cursorTimeout?: ReturnType<typeof setTimeout>;
    loggedWaylandWarning: boolean;
}

const mirrorStates = new WeakMap<WebSocket, MirrorState>();

function getMirrorState(ws: WebSocket): MirrorState {
    let state = mirrorStates.get(ws);
    if (!state) {
        state = {
            frameInProgress: false,
            frameW: 640,
            frameH: 360,
            logScreenW: 1920,
            logScreenH: 1080,
            loggedWaylandWarning: false
        };
        mirrorStates.set(ws, state);
    }
    return state;
}

function getLocalIp(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

function isLocalhost(request: IncomingMessage): boolean {
    const addr = request.socket.remoteAddress;
    if (!addr) return false;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// server: any is used to support Vite's dynamic httpServer types (http, https, http2)
export function createWsServer(server: any) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP = getLocalIp();
    const MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB limit

    logger.info('WebSocket server initialized');

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);

        if (url.pathname !== '/ws') return;

        const token = url.searchParams.get('token');
        const local = isLocalhost(request);

        logger.info(`Upgrade request received from ${request.socket.remoteAddress}`);

        if (local) {
            logger.info('Localhost connection allowed');
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, token, true);
            });
            return;
        }

        // Remote connections require a token
        if (!token) {
            logger.warn('Unauthorized connection attempt: No token provided');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }


        // Validate against known tokens
        if (!isKnownToken(token)) {
            logger.warn('Unauthorized connection attempt: Invalid token');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        logger.info('Remote connection authenticated successfully');

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, token, false);
        });
    });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage, token: string | null, isLocal: boolean) => {
        // Localhost: only store token if it's already known (trusted scan)
        // Remote: token is already validated in the upgrade handler
        logger.info(`Client connected from ${request.socket.remoteAddress}`);

        if (token && (isKnownToken(token) || !isLocal)) {
            storeToken(token);
        }

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        let lastRaw = '';
        let lastTime = 0;
        const DUPLICATE_WINDOW_MS = 100;

        ws.on('message', async (data: WebSocket.RawData) => {
            try {
                const raw = data.toString();
                const now = Date.now();

                if (raw.length > MAX_PAYLOAD_SIZE) {
                    logger.warn('Payload too large, rejecting message.');
                    return;
                }

                const msg = JSON.parse(raw);

                // request-frame is intentionally sent at high frequency; never filter it
                if (msg.type !== 'request-frame') {
                    // Prevent rapid identical message spam for all other messages
                    if (raw === lastRaw && (now - lastTime) < DUPLICATE_WINDOW_MS) {
                        return;
                    }
                    lastRaw = raw;
                    lastTime = now;
                    logger.info(`Received message (${raw.length} bytes)`);
                }

                // PERFORMANCE: Only touch if it's an actual command (not ping/ip)
                if (token && msg.type !== 'get-ip' && msg.type !== 'generate-token') {
                    touchToken(token);
                }

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
                    return;
                }

                if (msg.type === 'generate-token') {
                    if (!isLocal) {
                        logger.warn('Token generation attempt from non-localhost');
                        ws.send(JSON.stringify({ type: 'auth-error', error: 'Only localhost can generate tokens' }));
                        return;
                    }

                    // Idempotent: return active token if one exists
                    let tokenToReturn = getActiveToken();
                    if (!tokenToReturn) {
                        tokenToReturn = generateToken();
                        storeToken(tokenToReturn);
                        logger.info('New token generated');
                    } else {
                        logger.info('Existing active token returned');
                    }

                    ws.send(JSON.stringify({ type: 'token-generated', token: tokenToReturn }));
                    return;
                }

                if (msg.type === 'update-config') {
                    try {
                        const configPath = './src/server-config.json';
                        const current = fs.existsSync(configPath)
                            ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                            : {};
                        const newConfig = { ...current, ...msg.config };
                        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

                        logger.info('Server configuration updated');
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                    } catch (e) {
                        logger.error(`Failed to update config: ${String(e)}`);
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                if (msg.type === 'request-frame') {
                    const state = getMirrorState(ws);
                    if (state.frameInProgress) return;
                    state.frameInProgress = true;

                    try {
                        const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY;

                        if (isWayland) {
                            if (!state.loggedWaylandWarning) {
                                logger.warn('Screen capture not supported on Wayland via X11');
                                state.loggedWaylandWarning = true;
                            }
                            throw new Error('WAYLAND_UNSUPPORTED');
                        }

                        const img = await Promise.race([
                            screen.grab(),
                            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500))
                        ]);

                        if (!img) throw new Error('GRAB_FAILED');

                        const targetW = 640;
                        let pipeline = sharp(Buffer.from(img.data), {
                            raw: { width: img.width, height: img.height, channels: 4 },
                        });

                        // nut-js returns BGRA on Windows. Recombine channels efficiently.
                        if (process.platform === 'win32') {
                            pipeline = pipeline.recomb([
                                [0, 0, 1, 0], // B -> R
                                [0, 1, 0, 0], // G -> G
                                [1, 0, 0, 0], // R -> B
                                [0, 0, 0, 1], // A (keep)
                            ]);
                        }

                        const buffer = await pipeline
                            .resize(targetW, null, { withoutEnlargement: true })
                            .jpeg({ quality: 55 })
                            .toBuffer();

                        state.frameW = Math.min(targetW, img.width);
                        state.frameH = Math.round(state.frameW * (img.height / img.width));

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(buffer);
                        }
                    } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : 'Unknown error';
                        logger.error(`Mirroring error: ${message}`);

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'mirror-error',
                                message: message === 'WAYLAND_UNSUPPORTED' ? 'Screen capture not supported on Wayland' : 'Mirroring failed',
                                isWayland: process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY
                            }));
                        }
                    } finally {
                        state.frameInProgress = false;
                    }
                    return;
                }

                if (msg.type === 'start-mirror') {
                    logger.info('Mirroring started');
                    const state = getMirrorState(ws);

                    try {
                        const [logW, logH] = await Promise.race([
                            Promise.all([screen.width(), screen.height()]),
                            new Promise<[number, number]>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500))
                        ]);
                        state.logScreenW = logW;
                        state.logScreenH = logH;
                    } catch (e) {
                        logger.warn(`Failed to get screen dimensions: ${e}`);
                    }

                    // Independent cursor stream via self-scheduling timeout to prevent stacking.
                    clearTimeout(state.cursorTimeout);
                    const updateCursor = async () => {
                        if (ws.readyState !== WebSocket.OPEN) return;
                        if (ws.bufferedAmount > 4096) {
                            state.cursorTimeout = setTimeout(updateCursor, 33);
                            return;
                        }
                        try {
                            const pos = await mouse.getPosition();
                            ws.send(JSON.stringify({
                                type: 'cursor-pos',
                                fx: Math.round((pos.x / state.logScreenW) * state.frameW),
                                fy: Math.round((pos.y / state.logScreenH) * state.frameH),
                            }));
                        } catch { /* ignore transient errors */ }
                        state.cursorTimeout = setTimeout(updateCursor, 33);
                    };
                    state.cursorTimeout = setTimeout(updateCursor, 33);
                    return;
                }

                if (msg.type === 'stop-mirror') {
                    logger.info('Mirroring stopped');
                    const state = getMirrorState(ws);
                    clearTimeout(state.cursorTimeout);
                    state.cursorTimeout = undefined;
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);

            } catch (err: any) {
                logger.error(`Error processing message: ${err?.message || err}`);
            }
        });

        ws.on('close', () => {
            const state = getMirrorState(ws);
            clearTimeout(state.cursorTimeout);
            logger.info('Client disconnected');
        });

        ws.on('error', (error: Error) => {
            logger.error(`WebSocket error: ${error.message}`);
        });
    });
}
