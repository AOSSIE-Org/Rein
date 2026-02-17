import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { logger } from './logger';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';

logger.init();

function getLocalIp(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

export function createWsServer(server: Server) {
    const wss          = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP       = getLocalIp();

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`WS LAN IP: ${LAN_IP}`);
    logger.info(`WebSocket server initialized — LAN IP: ${LAN_IP}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        if (request.url === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        const clientIp = request.socket.remoteAddress ?? 'unknown';
        console.log(`Client connected to /ws — IP: ${clientIp}`);
        logger.info(`Client connected — IP: ${clientIp}`);

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        ws.on('message', async (data: string) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: LAN_IP }));
                    return;
                }

                if (msg.type === 'update-config') {
                    console.log('Updating config:', msg.config);
                    logger.info('Updating config:', msg.config);
                    try {
                        const configPath = './src/server-config.json';
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const current = fs.existsSync(configPath)
                            ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                            : {};
                        fs.writeFileSync(configPath, JSON.stringify({ ...current, ...msg.config }, null, 2));
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                        console.log('Config updated. Vite should auto-restart.');
                        logger.info('Config updated — server will auto-restart');
                    } catch (e) {
                        console.error('Failed to update config:', e);
                        logger.error('Failed to update config:', e);
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);
            } catch (err) {
                console.error('Error processing message:', err);
                logger.error('Error processing message:', err);
            }
        });

        ws.on('close', () => {
            console.log(`Client disconnected`);
            logger.info(`Client disconnected — IP: ${clientIp}`);
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            logger.error('WebSocket error:', error);
        };
    });
}