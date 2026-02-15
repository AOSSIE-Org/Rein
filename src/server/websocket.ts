import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
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

export function createWsServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP = getLocalIp();

    console.log(`WebSocket Server initialized`);
    console.log(`LAN IP: ${LAN_IP}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const pathname = request.url;

        if (pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws: WebSocket) => {
        console.log('📱 Client connected');
        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        ws.on('message', async (data: string) => {
            let raw = '';
            try {
                raw = data.toString();
                const msg = JSON.parse(raw);

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
                    return;
                }

                if (msg.type === 'update-config') {
                    try {
                        const configPath = './src/server-config.json';
                        const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
                        const newConfig = { ...current, ...msg.config };
                        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                    } catch (e) {
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);

            } catch (err) {
                // Distinguish JSON parse errors from runtime errors
                if (err instanceof SyntaxError) {
                    // Silent for parsing issues to avoid spamming move logs
                    return;
                }
                
                // Log actual execution errors (e.g., nut-js or inputHandler issues)
                console.error(`[Server] Error processing message:`, {
                    error: err instanceof Error ? err.message : String(err),
                    context: raw.substring(0, 100)
                });
            }
        });

        ws.on('close', () => {
            console.log('📱 Client disconnected');
        });

        ws.onerror = (err) => {
            console.error('[Server] WebSocket error:', err);
        };
    });
}