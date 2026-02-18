import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { storeToken, isKnownToken, touchToken, generateToken, getActiveToken } from './tokenStore';
import os from 'os';
import fs from 'fs';
import { IncomingMessage } from 'http';
import { Socket } from 'net';

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

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);

        if (url.pathname !== '/ws') return;

        const token = url.searchParams.get('token');
        const local = isLocalhost(request);

        // Localhost is always allowed (settings page, IP detection, etc.)
        if (local) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, token, true);
            });
            return;
        }

        // Remote connections require a token
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }


        // Validate against known tokens
        if (!isKnownToken(token)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, token, false);
        });
    });

    wss.on('connection', (ws: WebSocket, _request: IncomingMessage, token: string | null, isLocal: boolean) => {
        // Localhost: only store token if it's already known (trusted scan)
        // Remote: token is already validated in the upgrade handler
        if (token && (isKnownToken(token) || !isLocal)) {
            storeToken(token);
        }

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        ws.on('message', async (data: string) => {
            try {
                const raw = data.toString();

                // Prevent JSON DoS
                if (raw.length > MAX_PAYLOAD_SIZE) {
                    console.warn('Payload too large, rejecting message.');
                    return;
                }

                const msg = JSON.parse(raw);

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
                        ws.send(JSON.stringify({ type: 'auth-error', error: 'Only localhost can generate tokens' }));
                        return;
                    }

                    // Idempotent: return active token if one exists
                    let tokenToReturn = getActiveToken();
                    if (!tokenToReturn) {
                        tokenToReturn = generateToken();
                        storeToken(tokenToReturn);
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
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                    } catch (e) {
                        console.error('Failed to update config:', e);
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);
            } catch (err) {
                console.error('Error processing message:', err);
            }
        });

        ws.on('close', () => { /* client disconnected */ });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}
