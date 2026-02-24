'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface MirrorFrameBin {
    type: 'mirror-frame-bin';
    data: ArrayBuffer;
}

export type WSInboundMessage =
    | { type: 'connected'; serverIp: string } // Handled by server-side logic we've seen
    | { type: 'server-ip'; ip: string }
    | { type: 'token-generated'; token: string }
    | { type: 'auth-error'; error: string }
    | { type: 'mirror-error'; message: string; isWayland?: boolean }
    | { type: 'cursor-pos'; fx: number; fy: number }
    | { type: 'config-updated'; success: boolean; error?: string }
    | MirrorFrameBin;

export type WSOutboundMessage =
    | { type: 'request-frame' }
    | { type: 'start-mirror' }
    | { type: 'stop-mirror' }
    | { type: 'generate-token' }
    | { type: 'get-ip' }
    | { type: 'update-config'; config: Record<string, any> }
    | { type: 'combo'; keys: string[] }
    | { type: 'click'; button: 'left' | 'right'; press: boolean }
    | { type: 'key'; key: string }
    | { type: 'text'; text: string };

export type MessageListener = (msg: WSInboundMessage) => void;

export const useRemoteConnection = () => {
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const listenersRef = useRef<Set<MessageListener>>(new Set());

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
                            const binMsg: WSInboundMessage = { type: 'mirror-frame-bin', data: event.data };
                            listenersRef.current.forEach(l => { l(binMsg); });
                        }
                        return;
                    }

                    const data = JSON.parse(event.data) as WSInboundMessage;
                    if (!data || typeof data.type !== 'string') return;

                    if (isMounted) {
                        listenersRef.current.forEach(l => { l(data); });
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

    const send = useCallback((msg: WSOutboundMessage) => {
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

    const addListener = useCallback((l: MessageListener) => {
        listenersRef.current.add(l);
        return () => { listenersRef.current.delete(l); };
    }, []);

    return { status, send, sendCombo, addListener };
};
