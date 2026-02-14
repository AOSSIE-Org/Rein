import { useState, useEffect, useCallback, useRef } from 'react';

export const useRemoteConnection = () => {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;
        let heartbeatTimer: NodeJS.Timeout;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);
            wsRef.current = socket;

            socket.onopen = () => {
                setStatus('connected');
                heartbeatTimer = setInterval(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                    }
                }, 3000);
            };
            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'pong') {
                        const ts = Number(msg.timestamp);
                        const rtt = Date.now() - ts;
                        if (Number.isFinite(ts) && Number.isFinite(rtt) && rtt >= 0 && rtt < 60000) {
                            setLatency(rtt);
                        }
                    }
                } catch (e) {
                    console.error("Error parsing WS message", e);
                }
            };
            socket.onclose = () => {
                setStatus('disconnected');
                setLatency(null);
                wsRef.current = null;
                clearInterval(heartbeatTimer);
                reconnectTimer = setTimeout(connect, 3000);
            };
            socket.onerror = (e) => {
                console.error("WS Error", e);
                socket.close();
            };
        };

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            clearInterval(heartbeatTimer);
            wsRef.current?.close();
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const sendCombo = useCallback(
        (msg:string[]) =>{
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type:"combo",
                    keys: msg,
                }));
            }
        }
    ,[])

    return { status, latency, send, sendCombo };
};
