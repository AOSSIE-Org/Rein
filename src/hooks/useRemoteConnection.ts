import { useState, useEffect, useCallback, useRef } from 'react';

export const useRemoteConnection = (onMessage?: (data: any) => void) => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'stale'>('disconnected');
    const [latency, setLatency] = useState<number | null>(null);

    // Use ref to keep onMessage stable across re-renders
    const onMessageRef = useRef(onMessage);
    useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;
        let heartbeatInterval: NodeJS.Timeout;
        let lastPongTime = Date.now();
        let lastPingStart = 0;
        let missedPongs = 0;
        let activeSocket: WebSocket | null = null;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);
            activeSocket = socket;

            socket.onopen = () => {
                setStatus('connected');
                lastPongTime = Date.now();
                missedPongs = 0;
                
                heartbeatInterval = setInterval(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        lastPingStart = Date.now();
                        socket.send(JSON.stringify({ type: 'ping' }));

                        // Increment missedPongs only if a pong timeout is confirmed (> 4s)
                        if (Date.now() - lastPongTime > 4000) {
                            missedPongs++;

                            // Recovery strategy: if missed too many pongs, force closed to trigger reconnect
                            if (missedPongs >= 3) {
                                console.warn('Connection stale. Forcing reconnect...');
                                socket.close();
                            } else if (missedPongs >= 2) {
                                setStatus('stale');
                                setLatency(null);
                            }
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
                        missedPongs = 0;
                        // Functional update to avoid stale closure on 'status'
                        setStatus(prev => prev === 'stale' ? 'connected' : prev);
                    } else {
                        // Forward all other message types to the callback
                        onMessageRef.current?.(data);
                    }
                } catch (e) {
                    console.error("Message error", e);
                }
            };

            socket.onclose = () => {
                setStatus('disconnected');
                setLatency(null);
                clearInterval(heartbeatInterval);
                activeSocket = null;
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
            activeSocket?.close();
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }, [ws]);

    return { status, send, latency };
};
