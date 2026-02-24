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

/** Extended WebSocket that carries per-connection mirror state. */
type MirrorWs = WebSocket & {
    _frameInProgress?: boolean;
    _frameW?: number;
    _frameH?: number;
    _logScreenW?: number;
    _logScreenH?: number;
    _cursorInterval?: ReturnType<typeof setInterval>;
    _loggedWaylandWarning?: boolean;
};

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

    wss.on('connection', (ws: MirrorWs, request: IncomingMessage, token: string | null, isLocal: boolean) => {
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
                    if (ws._frameInProgress) return;
                    ws._frameInProgress = true;

                    try {
                        const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY;

                        // robotjs (via nut-js) uses X11 and often crashes on Wayland with BadMatch errors.
                        if (isWayland) {
                            if (!ws._loggedWaylandWarning) {
                                logger.warn('Screen capture may fail or crash on Wayland/XWayland. Skipping to maintain server stability.');
                                ws._loggedWaylandWarning = true;
                            }
                            throw new Error('Screen capture not supported on Wayland via X11');
                        }

                        const img = await Promise.race([
                            screen.grab(),
                            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Screen grab timeout')), 2500))
                        ]);

                        if (!img) throw new Error('Screen grab returned null');

                        // nut-js returns BGRA on Windows. Swap B↔R for correct RGB.
                        const raw = Buffer.from(img.data);
                        for (let i = 0; i < raw.length; i += 4) {
                            const b = raw[i];
                            raw[i] = raw[i + 2];
                            raw[i + 2] = b;
                        }

                        const targetW = 640;
                        const buffer = await sharp(raw, {
                            raw: { width: img.width, height: img.height, channels: 4 },
                        })
                            .resize(targetW, null, { withoutEnlargement: true })
                            .jpeg({ quality: 55 })
                            .toBuffer();

                        // Store actual JPEG frame dimensions for DPI-safe cursor mapping.
                        ws._frameW = Math.min(targetW, img.width);
                        ws._frameH = Math.round(ws._frameW * (img.height / img.width));

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(buffer);
                        }
                    } catch (err: any) {
                        ws._frameInProgress = false;
                        logger.error(`Mirroring error: ${err.message}`);
                        ws.send(JSON.stringify({
                            type: 'mirror-error',
                            message: err.message,
                            isWayland: process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY
                        }));
                    } finally {
                        ws._frameInProgress = false;
                    }
                    return;
                }

                if (msg.type === 'start-mirror') {
                    logger.info('Mirroring started');

                    // Get logical screen dimensions once (DPI-safe cursor normalization).
                    // mouse.getPosition() is in logical space; screen.grab() is physical.
                    const [logW, logH] = await Promise.all([screen.width(), screen.height()]);
                    ws._logScreenW = logW;
                    ws._logScreenH = logH;

                    // Independent 30 fps cursor stream, decoupled from frame grabs.
                    clearInterval(ws._cursorInterval);
                    ws._cursorInterval = setInterval(async () => {
                        if (ws.readyState !== WebSocket.OPEN) return;
                        // Skip if socket is backed up — don't let cursor flood frames
                        if (ws.bufferedAmount > 4096) return;
                        try {
                            const pos = await mouse.getPosition();
                            const lW = ws._logScreenW ?? 1920;
                            const lH = ws._logScreenH ?? 1080;
                            const fW = ws._frameW ?? 640;
                            const fH = ws._frameH ?? 360;
                            ws.send(JSON.stringify({
                                type: 'cursor-pos',
                                fx: Math.round((pos.x / lW) * fW),
                                fy: Math.round((pos.y / lH) * fH),
                            }));
                        } catch { /* ignore transient cursor read errors */ }
                    }, 33);
                    return;
                }

                if (msg.type === 'stop-mirror') {
                    logger.info('Mirroring stopped');
                    clearInterval(ws._cursorInterval);
                    ws._cursorInterval = undefined;
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);

            } catch (err: any) {
                logger.error(`Error processing message: ${err?.message || err}`);
            }
        });

        ws.on('close', () => {
            clearInterval(ws._cursorInterval);
            logger.info('Client disconnected');
        });

        ws.on('error', (error: Error) => {
            logger.error(`WebSocket error: ${error.message}`);
        });
    });
}
