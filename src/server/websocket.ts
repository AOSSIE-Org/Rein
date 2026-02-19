import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { storeToken, isKnownToken, touchToken, generateToken, getActiveToken } from './tokenStore';
import os from 'os';
import fs from 'fs';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import logger from '../utils/logger';

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

                // Prevent rapid identical message spam
                if (raw === lastRaw && (now - lastTime) < DUPLICATE_WINDOW_MS) {
                    return;
                }

                lastRaw = raw;
                lastTime = now;

                logger.info(`Received message (${raw.length} bytes)`);

                if (raw.length > MAX_PAYLOAD_SIZE) {
                    logger.warn('Payload too large, rejecting message.');
                    return;
                }

                const msg = JSON.parse(raw);

                // PERFORMANCE: Only touch if it's an actual command (not ping/ip)
                if (token && msg.type !== 'get-ip' && msg.type !== 'ping' && msg.type !== 'generate-token') {
                    touchToken(token);
                }

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
                    return;
                }

                if (msg.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
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

                await inputHandler.handleMessage(msg as InputMessage);

            } catch (err: any) {
                logger.error(`Error processing message: ${err?.message || err}`);
            }
        });

        ws.on('close', () => {
            logger.info('Client disconnected');
        });

        ws.on('error', (error: Error) => {
            console.error('WebSocket error:', error);
            logger.error(`WebSocket error: ${error.message}`);
        });
    });
}
