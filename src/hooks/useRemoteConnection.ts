import { useState, useEffect, useCallback, useRef } from 'react';
import type { RemoteMessage } from '@/types';

export const useRemoteConnection = () => {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [latency, setLatency] = useState<number | null>(null);

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
        let heartbeatTimer: NodeJS.Timeout;
        let reconnectDelay = 1000;
        const MAX_RECONNECT_DELAY = 30000;

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
            wsRef.current = socket;

            socket.onopen = () => {
                if (!isMounted) return;
                setStatus('connected');
                reconnectDelay = 1000;

                // Fire first ping right away so the UI updates instantly
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                }

                clearInterval(heartbeatTimer);
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
                } catch {
                    // ignore non-JSON or malformed server messages
                }
            };

            socket.onclose = () => {
                if (!isMounted) return;
                setStatus('disconnected');
                setLatency(null);
                wsRef.current = null;
                clearInterval(heartbeatTimer);

                const delay = reconnectDelay;
                reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
                reconnectTimer = setTimeout(connect, delay);
            };

            socket.onerror = (e) => {
                console.error('WS Error', e);
                socket.close();
            };
        };

        // Defer to next tick so React Strict Mode's immediate unmount
        // sets isMounted=false before any socket is created
        const initialTimer = setTimeout(connect, 0);

        return () => {
            isMounted = false;
            clearTimeout(initialTimer);
            clearTimeout(reconnectTimer);
            clearInterval(heartbeatTimer);

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

    const send = useCallback((msg: RemoteMessage) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const sendCombo = useCallback((keys: string[]) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'combo',
                keys,
            }));
        }
    }, []);

    return { status, latency, send, sendCombo };
};
