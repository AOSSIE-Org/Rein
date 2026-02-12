import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';

// Helper to find LAN IPs
function getLocalIps() {
    const nets = os.networkInterfaces();
    const results: string[] = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    return results.length > 0 ? results : ['localhost'];
}

export function createWsServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IPS = getLocalIps();
    // Heuristic: Prefer 192.168.x.x, then 10.x.x.x, then first available
    const BEST_IP = LAN_IPS.find(ip => ip.startsWith('192.168.'))
        || LAN_IPS.find(ip => ip.startsWith('10.'))
        || LAN_IPS[0];

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`WS LAN IPS: ${LAN_IPS.join(', ')}`);
    console.log(`Selected Best IP: ${BEST_IP}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const pathname = request.url;

        if (pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws: WebSocket) => {
        console.log('Client connected to /ws');

        ws.send(JSON.stringify({ type: 'connected', serverIp: BEST_IP, ips: LAN_IPS }));

        ws.on('message', async (data: string) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: BEST_IP, ips: LAN_IPS }));
                    return;
                }

                if (msg.type === 'update-config') {
                    console.log('Updating config:', msg.config);
                    try {
                        const configPath = './src/server-config.json';
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
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

                await inputHandler.handleMessage(msg as InputMessage);
            } catch (err) {
                console.error('Error processing message:', err);
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}
