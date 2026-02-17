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

function maskIp(ip: string | undefined): string {
    if (!ip) return 'unknown';
    const v4 = ip.match(/^(\d+\.\d+\.\d+\.)\d+$/);
    if (v4) return `${v4[1]}x`;
    const v6 = ip.match(/^([0-9a-f]{0,4}:[0-9a-f]{0,4}:[0-9a-f]{0,4}:[0-9a-f]{0,4}):/i);
    if (v6) return `${v6[1]}:x:x:x:x`;
    return 'unknown';
}

export function createWsServer(server: Server) {
    const wss          = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP       = getLocalIp();

    logger.info(`WebSocket server initialised — LAN IP: ${LAN_IP}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        if (request.url === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        const clientIp = maskIp(request.socket.remoteAddress);
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
                    logger.info('Updating config:', msg.config);
                    try {
                        const configPath = './src/server-config.json';
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const current = fs.existsSync(configPath)
                            ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                            : {};
                        fs.writeFileSync(configPath, JSON.stringify({ ...current, ...msg.config }, null, 2));
                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                        logger.info('Config updated — server will auto-restart');
                    } catch (e) {
                        logger.error('Failed to update config:', e);
                        ws.send(JSON.stringify({ type: 'config-updated', success: false, error: String(e) }));
                    }
                    return;
                }

                await inputHandler.handleMessage(msg as InputMessage);
            } catch (err) {
                logger.error('Error processing message:', err);
            }
        });

        ws.on('close', () => {
            logger.info(`Client disconnected — IP: ${clientIp}`);
        });

        ws.onerror = (error) => {
            logger.error('WebSocket error:', error);
        };
    });
}