import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
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
    const wss = new WebSocketServer({ noServer: true });
    const inputHandler = new InputHandler();
    const LAN_IP = getLocalIp();

    // Generate a random 6-digit PIN
    const PIN = Math.floor(100000 + Math.random() * 900000).toString();
    // Map to track authentication status of clients
    const clientAuth = new WeakMap<WebSocket, boolean>();

    console.log(`WebSocket Server initialized (Upgrade mode)`);
    console.log(`WS LAN IP: ${LAN_IP}`);
    console.log(`SESSION PIN: ${PIN}`);

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const pathname = request.url;

        if (pathname === '/ws') {
            wss.handleUpgrade(request, , req: IncomingMessage) => {
        console.log('Client connected to /ws');

        // Determine if client is local (localhost)
        const remoteAddress = req.socket.remoteAddress;
        const isLocal = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';

        // Auto-authenticate localhost, otherwise require PIN
        if (isLocal) {
            clientAuth.set(ws, true);
            console.log('Local client authenticated automatically.');
        } else {
            clientAuth.set(ws, false);
            console.log('Remote client connected. Waiting for authentication.');
        }

        // Send initial connection details. 
        // If local, include the PIN so the desktop app can display it.
        // If remote, indicate auth is required.
        ws.send(JSON.stringify({ 
            type: 'connected', 
            serverIp: LAN_IP, 
            authRequired: !isLocal,
            pin: isLocal ? PIN : undefined 
        }));

        ws.on('message', async (data: string) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);

                // Handle Authentication
                if (msg.type === 'authenticate') {
                    if (msg.pin === PIN) {
                        clientAuth.set(ws, true);
                        ws.send(JSON.stringify({ type: 'auth-success' }));
                        console.log('Client authenticated successfully.');
                    } else {
                        ws.send(JSON.stringify({ type: 'auth-failed' }));
                        console.log('Client failed authentication.');
                    }
                    return;
                }

                // Reject all other messages if not authenticated
                if (!clientAuth.get(ws)) {
                    // Start of Selection
                    // If the message is only checking IP, we might want to allow it?
                    // But for security, let's block everything except auth.
                    // ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
                    return;
                }
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
            console.log('Client disconnected');
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}
