import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { logger } from './logger';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';

// Helper to find LAN IP
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
    // Initialise logger first — all console calls below are now captured
    logger.init();
    console.log(`Log file: ${logger.getLogPath()}`);

    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
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
        const clientIp = request.socket.remoteAddress ?? 'unknown';
        console.log(`Client connected to /ws — IP: ${clientIp}`);

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        ws.on('message', async (data: string) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
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
            const clientIp = request.socket.remoteAddress ?? 'unknown';
            console.log(`Client disconnected — IP: ${clientIp}`);
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}