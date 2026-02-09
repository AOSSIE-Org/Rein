import { useState, useEffect, useCallback } from 'react';

export const useRemoteConnection = () => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'stale'>('disconnected');
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;
        let heartbeatInterval: NodeJS.Timeout;
        let lastPongTime = Date.now();
        let lastPingStart = 0;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                setStatus('connected');
                lastPongTime = Date.now();
                
                heartbeatInterval = setInterval(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        lastPingStart = Date.now();
                        socket.send(JSON.stringify({ type: 'ping' }));

                        // If no pong for > 4s, mark as stale
                        if (Date.now() - lastPongTime > 4000) {
                            setStatus('stale');
                            setLatency(null);
                        }
                    }
                }, 2000);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'pong') {
                        const now = Date.now();
                        setLatency(now - lastPingStart);
                        lastPongTime = now;
                        setStatus('connected');
                    }
                } catch (e) {
                    console.error("Message error", e);
                }
            };

            socket.onclose = () => {
                setStatus('disconnected');
                setLatency(null);
                clearInterval(heartbeatInterval);
                reconnectTimer = setTimeout(connect, 3000);
            };

            socket.onerror = (e) => {
                console.error("WS Error", e);
                socket.close();
            };

            setWs(socket);
        };

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            clearInterval(heartbeatInterval);
            ws?.close();
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }, [ws]);

    return { status, send, latency };
};
