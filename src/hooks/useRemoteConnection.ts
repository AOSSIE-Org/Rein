import { useState, useEffect, useCallback } from 'react';

export const useRemoteConnection = () => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authRequired, setAuthRequired] = useState(false);
    const [authError, setAuthError] = useState(false);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                setStatus('connected');
                // Auth state is determined by the 'connected' message
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'connected') {
                        if (msg.authRequired) {
                            setAuthRequired(true);
                            setIsAuthenticated(false);
                        } else {
                            setIsAuthenticated(true);
                            setAuthRequired(false);
                        }
                    } else if (msg.type === 'auth-success') {
                        setIsAuthenticated(true);
                        setAuthError(false);
                    } else if (msg.type === 'auth-failed') {
                        setAuthError(true);
                        setIsAuthenticated(false);
                    }
                } catch (e) {
                    console.error('WS Message Error', e);
                }
            };

            socket.onclose = () => {
                setStatus('disconnected');
                setIsAuthenticated(false);
                setAuthRequired(false);
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

    const authenticate = useCallback((pin: string) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'authenticate', pin }));
        }
    }, [ws]);

    return { status, send, isAuthenticated, authRequired, authenticate, authError };
};
