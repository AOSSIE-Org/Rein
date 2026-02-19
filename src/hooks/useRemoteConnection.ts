import { useState, useEffect, useCallback, useRef } from 'react';

export const useRemoteConnection = () => {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    
    // This holds the text synced from your PC
    const clipboardRef = useRef<string>('');

    useEffect(() => {
        let isMounted = true;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        const storedToken = localStorage.getItem('rein_auth_token');
        const token = urlToken || storedToken;

        if (urlToken && urlToken !== storedToken) {
            localStorage.setItem('rein_auth_token', urlToken);
        }

        let wsUrl = `${protocol}//${host}/ws`;
        if (token) wsUrl += `?token=${encodeURIComponent(token)}`;

        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            if (!isMounted) return;

            if (wsRef.current) {
                wsRef.current.onopen = null;
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.onmessage = null;
                wsRef.current.close();
            }

            setStatus('connecting');
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                if (isMounted) setStatus('connected');
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Sync PC clipboard to phone memory
                    if (data.type === 'clipboard-content') {
                        console.log('[Client] Clipboard synced from PC:', data.text);
                        clipboardRef.current = data.text;
                    }
                } catch (e) {
                    console.error('[Client] Error parsing WS message:', e);
                }
            };

            socket.onclose = () => {
                if (isMounted) {
                    setStatus('disconnected');
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
            socket.onerror = () => socket.close();

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
            }
        };
    }, []);

    const send = useCallback((msg: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    const sendCombo = useCallback((msg: string[]) => {
        send({ type: "combo", keys: msg });
    }, [send]);

    const requestCopy = useCallback(() => {
        console.log('[Client] Requesting native Copy');
        send({ type: 'clipboard', clipboardAction: 'copy' });
    }, [send]);

    const requestPaste = useCallback(() => {
        console.log('[Client] Requesting native Paste');
        // Send actual text string for terminal-safe typing
        send({ 
            type: 'clipboard', 
            clipboardAction: 'paste', 
            text: clipboardRef.current 
        });
    }, [send]);

    return { status, send, sendCombo, requestCopy, requestPaste };
};