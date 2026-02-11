import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';

/**
 * Retrieves the local IPv4 address of the host machine.
 * Filters for non-internal (non-loopback) IPv4 interfaces.
 * 
 * @returns {string} The local IPv4 address or 'localhost' if no interface is found.
 */
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

/**
 * Initializes the WebSocket server and sets up network interface polling.
 * Handles WebSocket upgrades, client connections, and real-time IP broadcasts.
 * 
 * @param {Server} server - The HTTP server instance to attach the WebSocket server to.
 */
export function createWsServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();

    let currentIp = getLocalIp();

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`Initial WS LAN IP: ${currentIp}`);

    // Frequency for network interface polling (ms)
    const POLLING_INTERVAL = 5000;

    const pollingIntervalId = setInterval(() => {
        const newIp = getLocalIp();
        if (newIp !== currentIp) {
            console.log(`Network Change Detected! IP: ${currentIp} -> ${newIp}`);
            currentIp = newIp;

            // Broadcast the new IP to all connected clients
            const updateMsg = JSON.stringify({ type: 'server-ip', ip: currentIp });
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(updateMsg);
                }
            });
        }
    }, POLLING_INTERVAL);

    // Cleanup interval when the WebSocket server closes
    wss.on('close', () => {
        console.log('Clearing network polling interval');
        clearInterval(pollingIntervalId);
    });

    // Also handle process exit to ensure cleanup
    process.on('SIGTERM', () => clearInterval(pollingIntervalId));
    process.on('SIGINT', () => clearInterval(pollingIntervalId));

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

        // Send current IP immediately on connection
        ws.send(JSON.stringify({ type: 'connected', ip: currentIp }));

        ws.on('message', async (data: string) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: currentIp }));
                    return;
                }
                // ... existing update-config logic ...

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
