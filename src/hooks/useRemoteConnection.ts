import { useState, useEffect, useCallback, useRef } from 'react';

export const useRemoteConnection = () => {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    
    // Live reference to the current socket to prevent stale closures in callbacks
    const currentWsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        let reconnectTimer: NodeJS.Timeout;
        let disposed = false; // Flag to prevent logic from running after unmount

        const connect = () => {
            if (disposed) return;
            
            console.log(`Connecting to ${wsUrl}`);
            setStatus('connecting');
            const socket = new WebSocket(wsUrl);
            
            currentWsRef.current = socket;

            socket.onopen = () => {
                if (disposed) {
                    socket.close();
                    return;
                }
                console.log('[WS] Connected');
                setStatus('connected');
            };
            
            socket.onclose = () => {
                if (disposed) return;
                
                console.log('[WS] Disconnected, reconnecting in 1s...');
                setStatus('disconnected');
                reconnectTimer = setTimeout(connect, 1000);
            };
            
            socket.onerror = (e) => {
                console.error("[WS] Error", e);
                socket.close();
            };
            
            setWs(socket);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !disposed) {
                console.log('[WS] App resumed');
                // Only reconnect if the socket is explicitly CLOSED to avoid racing with CONNECTING
                if (!currentWsRef.current || currentWsRef.current.readyState === WebSocket.CLOSED) {
                    clearTimeout(reconnectTimer);
                    connect();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        connect();

        return () => {
            disposed = true; // Mark as disposed first to block onclose from triggering connect()
            clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            currentWsRef.current?.close();
            currentWsRef.current = null;
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (currentWsRef.current?.readyState === WebSocket.OPEN) {
            currentWsRef.current.send(JSON.stringify(msg));
        } else {
            console.warn('[WS] Cannot send, not connected');
        }
    }, []); 

    const sendCombo = useCallback((msg: string[]) => {
        if (currentWsRef.current?.readyState === WebSocket.OPEN) {
            currentWsRef.current.send(JSON.stringify({
                type: "combo",
                keys: msg,
            }));
        } else {
            console.warn('[WS] Cannot send combo, not connected');
        }
    }, []); 

    return { status, send, sendCombo, ws };
};