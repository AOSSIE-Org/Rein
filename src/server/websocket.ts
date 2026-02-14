import { WebSocketServer, WebSocket } from 'ws';
import { InputHandler, InputMessage } from './InputHandler';
import { ClipboardMonitor } from './ClipboardMonitor';
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

    wss.on('connection', (ws: WebSocket) => {
        console.log('Client connected to /ws');

        ws.send(JSON.stringify({ type: 'connected', serverIp: LAN_IP }));

        // ========== CLIPBOARD SYNC: INVISIBLE MODE ==========
        const clipboardMonitor = new ClipboardMonitor((clipboardData) => {
            // Computer clipboard changed → Send to phone
            ws.send(JSON.stringify({
                type: 'clipboard-sync',
                data: clipboardData
            }));
        });

        clipboardMonitor.start();

        // Send current clipboard to phone on connect
        const currentClipboard = clipboardMonitor.getCurrent();
        if (currentClipboard) {
            ws.send(JSON.stringify({
                type: 'clipboard-sync',
                data: currentClipboard
            }));
        }
        // ====================================================

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

                // ========== CLIPBOARD SYNC: PHONE → COMPUTER ==========
                if (msg.type === 'clipboard-sync') {
                    const clipboardData = msg.data;
                    
                    console.log('[Clipboard] Phone copied:', clipboardData.text.substring(0, 50));
                    
                    // Update computer clipboard
                    await clipboardMonitor.setClipboard(clipboardData.text, 'phone');
                    
                    // Acknowledge
                    ws.send(JSON.stringify({ 
                        type: 'clipboard-sync-ack',
                        success: true,
                        timestamp: clipboardData.timestamp
                    }));
                    return;
                }
                // =====================================================

                await inputHandler.handleMessage(msg as InputMessage);
            } catch (err) {
                console.error('Error processing message:', err);
            }
        });

        ws.on('close', () => {
            clipboardMonitor.stop();
            console.log('[Clipboard] Monitoring stopped for disconnected client');
            console.log('Client disconnected');
        });

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    });
}