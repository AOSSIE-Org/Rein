import { useState, useEffect, useCallback } from 'react';

export const useRemoteConnection = () => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;
        let currentWs: WebSocket | null = null;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);
            currentWs = socket;

            socket.onopen = () => {
                console.log('[WS] Connected');
                setStatus('connected');
            };
            
            socket.onclose = () => {
                console.log('[WS] Disconnected, reconnecting in 1s...');
                setStatus('disconnected');
                // Faster reconnect for mobile (1 second instead of 3)
                reconnectTimer = setTimeout(connect, 1000);
            };
            
            socket.onerror = (e) => {
                console.error("[WS] Error", e);
                socket.close();
            };
            
            setWs(socket);
        };

        // Handle page visibility (when user switches apps)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[WS] App resumed');
                // If disconnected, reconnect immediately
                if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
                    clearTimeout(reconnectTimer);
                    connect();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        connect();

        return () => {
            clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            currentWs?.close();
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        } else {
            console.warn('[WS] Cannot send, not connected');
        }
    }, [ws]);

    const sendCombo = useCallback(
        (msg:string[]) =>{
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type:"combo",
                    keys: msg,
                }));
            } else {
                console.warn('[WS] Cannot send combo, not connected');
            }
        }
    ,[ws])

    return { status, send, sendCombo, ws };
};
