import { useState, useEffect, useCallback } from 'react';

export const useRemoteConnection = () => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => setStatus('connected');
            socket.onclose = () => {
                setStatus('disconnected');
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
            ws?.close();
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }, [ws]);

    const sendCombo = useCallback(
        (msg:string[]) =>{
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type:"combo",
                    keys: msg,
                }));
                
            }
        }
    ,[ws])

    return { status, send ,sendCombo};
};
