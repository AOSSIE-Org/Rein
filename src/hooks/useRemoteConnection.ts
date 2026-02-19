import { useState, useEffect, useCallback, useRef } from 'react';

export const useRemoteConnection = () => {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [lastMessage, setLastMessage] = useState<any>(null);
    const listenersRef = useRef<Set<(msg: any) => void>>(new Set());

    useEffect(() => {
        let isMounted = true;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        // Get token from URL params (passed via QR code) or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        const storedToken = localStorage.getItem('rein_auth_token');
        const token = urlToken || storedToken;

        // Persist URL token to localStorage for future reconnections
        if (urlToken && urlToken !== storedToken) {
            localStorage.setItem('rein_auth_token', urlToken);
        }

        let wsUrl = `${protocol}//${host}/ws`;
        if (token) {
            wsUrl += `?token=${encodeURIComponent(token)}`;
        }

        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            if (!isMounted) return;

            // Close any existing socket before creating a new one
            if (wsRef.current) {
                wsRef.current.onopen = null;
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.onmessage = null;
                wsRef.current.close();
                wsRef.current = null;
            }

            setStatus('connecting');
            const socket = new WebSocket(wsUrl);
            socket.binaryType = 'arraybuffer';

            socket.onopen = () => {
                if (isMounted) setStatus('connected');
            };
            socket.onclose = () => {
                if (isMounted) {
                    setStatus('disconnected');
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
            socket.onerror = () => {
                socket.close();
            };
            socket.onmessage = (event) => {
                try {
                    if (event.data instanceof ArrayBuffer) {
                        if (isMounted) {
                            listenersRef.current.forEach(l => l({ type: 'mirror-frame-bin', data: event.data }));
                        }
                        return;
                    }

                    const data = JSON.parse(event.data);
                    if (isMounted) {
                        setLastMessage(data);
                        listenersRef.current.forEach(l => l(data));
                    }
                } catch {
                    // Non-JSON frames (e.g. binary) handled above; ignore parse failures
                }
            };

            wsRef.current = socket;
        };

        const initialTimer = setTimeout(connect, 0);

        return () => {
            isMounted = false;
            clearTimeout(initialTimer);
            clearTimeout(reconnectTimer);
            if (wsRef.current) {
                wsRef.current.onopen = null;
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.onmessage = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const sendCombo = useCallback((msg: string[]) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "combo",
                keys: msg,
            }));
        }
    }, []);

    const addListener = useCallback((l: (msg: any) => void) => {
        listenersRef.current.add(l);
        return () => listenersRef.current.delete(l);
    }, []);

    return { status, send, sendCombo, lastMessage, addListener };
};
