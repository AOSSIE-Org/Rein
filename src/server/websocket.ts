import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import os from 'os';
import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import logger from '../utils/logger';
import { createSession, isValidSession, touchSession } from './sessionStore';
import { getPin, isLocalhost, validatePin } from './pinAuth';

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

const MAX_BODY_BYTES = 2048;
const AUTH_HANDLER_FLAG = Symbol.for('rein-auth-handler');

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > MAX_BODY_BYTES) {
            throw new Error('Payload too large');
        }
        chunks.push(buf);
    }

    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function handleAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/api/auth')) return false;

    if (url.pathname === '/api/auth/pin' && req.method === 'GET') {
        if (!isLocalhost(req)) {
            sendJson(res, 403, { error: 'PIN is only available on localhost.' });
            return true;
        }
        sendJson(res, 200, { pin: getPin() });
        return true;
    }

    if (url.pathname === '/api/auth/pin' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const pin = typeof body?.pin === 'string' ? body.pin : '';
            if (!validatePin(pin)) {
                sendJson(res, 401, { error: 'Invalid PIN.' });
                return true;
            }

            const token = createSession(req.socket.remoteAddress || undefined);
            sendJson(res, 200, { token });
            return true;
        } catch (error: any) {
            const message = error?.message === 'Payload too large' ? 'Payload too large.' : 'Invalid request.';
            sendJson(res, 400, { error: message });
            return true;
        }
    }

    if (url.pathname === '/api/auth/verify' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const token = typeof body?.token === 'string' ? body.token : '';
            sendJson(res, 200, { valid: Boolean(token && isValidSession(token)) });
            return true;
        } catch (error: any) {
            sendJson(res, 400, { error: 'Invalid request.' });
            return true;
        }
    }

    sendJson(res, 404, { error: 'Not found.' });
    return true;
}

// server: any is used to support Vite's dynamic httpServer types (http, https, http2)
export function createWsServer(server: any) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP = getLocalIp();
    const MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB limit

    logger.info('WebSocket server initialized');
    logger.info(`PIN authentication enabled. Current PIN: ${getPin()}`);

    if (!(server as any)[AUTH_HANDLER_FLAG]) {
        (server as any)[AUTH_HANDLER_FLAG] = true;
        server.on('request', (req: IncomingMessage, res: ServerResponse) => {
            handleAuthRequest(req, res).catch((error) => {
                logger.error(`Auth handler error: ${String(error)}`);
                if (!res.headersSent) {
                    sendJson(res, 500, { error: 'Server error.' });
                }
            });
        });
    }

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

        // Remote connections require a valid session token
        if (!token) {
            logger.warn('Unauthorized connection attempt: No token provided');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }


        // Validate against active sessions
        if (!isValidSession(token)) {
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
        logger.info(`Client connected from ${request.socket.remoteAddress}`);

        if (token && !isLocal) touchSession(token);

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
                if (token && msg.type !== 'get-ip') {
                    touchSession(token);
                }

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
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
