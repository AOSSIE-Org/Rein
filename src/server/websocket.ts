import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import os from 'os';
import fs from 'fs';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';
import path from 'path';

// interactions with the file system should be absolute to avoid CWD fragility
const CONFIG_PATH = path.resolve(__dirname, '../../src/server-config.json');

/**
 * Retrieves the local IPv4 address of the host machine.
 * Filters for non-internal (non-loopback) IPv4 interfaces.
 * 
 * @returns {string} The local IPv4 address or 'localhost' if no interface is found.
 */
function getLocalIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        const ifaceList = nets[name];
        if (!ifaceList) continue;
        for (const net of ifaceList) {
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
    const MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB limit

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`Initial WS LAN IP: ${currentIp}`);

    // Frequency for network interface polling (ms)
    // Read directly from config file
    let pollingInterval = 5000;

    const startPolling = () => {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
                if (typeof config.networkPollingInterval === 'number' && Number.isFinite(config.networkPollingInterval)) {
                    // Enforce minimum 100ms to prevent busy loops
                    pollingInterval = Math.max(100, config.networkPollingInterval);
                }
            }
        } catch (e) {
            console.error('Failed to read initial polling interval:', e);
        }
        return setInterval(pollIp, pollingInterval);
    };

    const pollIp = () => {
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
    };

    let pollingIntervalId = startPolling();


    // Cleanup interval when the WebSocket server closes
    wss.on('close', () => {
        console.log('Clearing network polling interval');
        clearInterval(pollingIntervalId);
    });

    // Also handle process exit to ensure cleanup
    const cleanup = () => {
        clearInterval(pollingIntervalId);
        process.exit(0);
    };

    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);

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

                // Prevent JSON DoS
                if (raw.length > MAX_PAYLOAD_SIZE) {
                    console.warn('Payload too large, rejecting message.');
                    return;
                }

                const msg = JSON.parse(raw);

                if (msg.type === 'get-ip') {
                    ws.send(JSON.stringify({ type: 'server-ip', ip: currentIp }));
                    return;
                }

                if (msg.type === 'update-config') {
                    console.log('Updating config:', msg.config);
                    try {
                        const current = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) : {};

                        // Whitelist allowed keys to prevent arbitrary file writes
                        const ALLOWED_KEYS = ['frontendPort', 'networkPollingInterval', 'mouseInvert', 'mouseSensitivity'];
                        const cleanConfig: Record<string, any> = {};

                        // Validate and copy only allowed keys
                        for (const key of ALLOWED_KEYS) {
                            if (Object.prototype.hasOwnProperty.call(msg.config, key)) {
                                const val = msg.config[key];
                                // Basic type validation
                                if (key === 'frontendPort' && (typeof val !== 'number' || !Number.isFinite(val))) continue;
                                if (key === 'networkPollingInterval' && (typeof val !== 'number' || !Number.isFinite(val))) continue;
                                if (key === 'mouseInvert' && typeof val !== 'boolean') continue;
                                if (key === 'mouseSensitivity' && (typeof val !== 'number' || !Number.isFinite(val))) continue;

                                cleanConfig[key] = val;
                            }
                        }

                        const newConfig = { ...current, ...cleanConfig };

                        fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));

                        // Restart polling if interval changed
                        if (cleanConfig.networkPollingInterval && cleanConfig.networkPollingInterval !== pollingInterval) {
                            console.log(`Polling interval changed: ${pollingInterval} -> ${cleanConfig.networkPollingInterval}`);
                            clearInterval(pollingIntervalId);
                            pollingIntervalId = startPolling();
                        }

                        ws.send(JSON.stringify({ type: 'config-updated', success: true }));
                        console.log('Config updated.');
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

