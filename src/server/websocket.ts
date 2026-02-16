import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { RateLimiter, InputValidator, InputSanitizer } from './middleware';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';

function getLocalIp() {
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

let connectionCounter = 0;

export function createWsServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const rateLimiter = new RateLimiter();
    const validator = new InputValidator();
    const sanitizer = new InputSanitizer();
    const LAN_IP = getLocalIp();

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`WS LAN IP: ${LAN_IP}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const pathname = request.url;

        if (pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        const clientId = `client-${++connectionCounter}`;
        console.log(`Client connected to /ws (${clientId})`);

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        ws.on('message', async (data: string) => {
            let msg: any;
            const raw = data.toString();
            
            try {
                msg = JSON.parse(raw);
            } catch (err) {
                if (err instanceof SyntaxError) {
                    return;
                } else {
                    console.error('[WS] Parse error:', err);
                    return;
                }
            }

            try {
                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
                    return;
                }

                if (msg.type === 'update-config') {
                    console.log('Updating config:', msg.config);
                    try {
                        const configPath = './src/server-config.json';
                        const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
                        const newConfig = { ...current, ...msg.config };

                        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                        console.log('Config updated. Vite should auto-restart.');
                    } catch (e) {
                        console.error('Failed to update config:', e);
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                if (!rateLimiter.shouldProcess(clientId, msg.type)) {
                    return;
                }

                if (!validator.isValid(msg)) {
                    console.warn('[Security] Invalid input:', msg.type);
                    return;
                }

                sanitizer.sanitize(msg);

                await inputHandler.handleMessage(msg as InputMessage);

            } catch (err) {
                console.error('[WS] Message handling error:', {
                    error: err,
                    messageType: msg?.type,
                    rawMessage: raw.substring(0, 100)
                });
            }
        });

        ws.on('close', () => {
            rateLimiter.cleanup(clientId);
            console.log(`Client disconnected (${clientId})`);
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}