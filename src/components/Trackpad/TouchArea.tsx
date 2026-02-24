'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WSMessage } from '@/hooks/useRemoteConnection';

const MESSAGES = {
    CONNECTING: 'Connecting Mirror...',
    UNSUPPORTED: 'Mirroring Unsupported',
    UNAVAILABLE: 'Mirroring Unavailable',
    STALLED: 'Stalled',
    SCROLL_ACTIVE: 'SCROLL ACTIVE',
    SCROLL_MODE: 'Scroll Mode',
    TOUCH_AREA: 'Touch Area'
} as const;

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: 'connecting' | 'connected' | 'disconnected';
    isMirroring?: boolean;
    addListener?: (l: (msg: WSMessage) => void) => () => void;
    send?: (msg: WSMessage) => void;
}

export const TouchArea: React.FC<TouchAreaProps> = ({
    scrollMode,
    isTracking,
    handlers,
    status,
    isMirroring,
    addListener,
    send
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cursorRef = useRef<{ fx: number; fy: number } | null>(null);
    const [hasFrame, setHasFrame] = useState(false);
    const [stalled, setStalled] = useState(false);
    const [mirrorError, setMirrorError] = useState<string | null>(null);
    const stalledTimer = useRef<NodeJS.Timeout | null>(null);
    const loadingRef = useRef<{ img: HTMLImageElement | null; url: string | null }>({ img: null, url: null });

    // Mirroring Frame Loop
    // Design Intent: TouchArea remains interactive during mirroring.
    // Touches pass through the canvas overlay (pointer-events-none) to the remote system.
    useEffect(() => {
        if (!isMirroring || !addListener || !send || status !== 'connected') {
            setHasFrame(false);
            setStalled(false);
            setMirrorError(null);
            return;
        }

        const requestFrame = () => send({ type: 'request-frame' });

        const cleanup = addListener((msg: any) => {
            if (msg.type === 'cursor-pos') {
                cursorRef.current = { fx: msg.fx, fy: msg.fy };
                return;
            }

            if (msg.type === 'mirror-error') {
                setMirrorError(msg.message);
                setHasFrame(false);
                return;
            }

            if (!(msg instanceof Uint8Array || msg instanceof Blob || (msg.type === 'mirror-frame-bin' && msg.data))) {
                return;
            }
            // ... [rest of the listener logic remains largely the same, but I'll ensure I use a single ReplacementChunk]
            // Handle both raw binary (if sent directly) and wrapped binary
            const frameData = (msg instanceof Uint8Array || msg instanceof Blob) ? msg : msg.data;

            if (stalledTimer.current) clearTimeout(stalledTimer.current);
            setStalled(false);
            stalledTimer.current = setTimeout(() => setStalled(true), 3000);

            const blob = new Blob([frameData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            loadingRef.current = { img, url };

            img.onload = () => {
                loadingRef.current = { img: null, url: null };
                const canvas = canvasRef.current;
                if (!canvas) { URL.revokeObjectURL(url); return; }
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(url); return; }

                if (canvas.width !== img.width || canvas.height !== img.height) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                setHasFrame(prev => prev ? prev : true);

                // Draw cursor overlay
                const cur = cursorRef.current;
                if (cur) {
                    const r = 8;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(cur.fx, cur.fy, r + 2, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(cur.fx, cur.fy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fill();
                    ctx.restore();
                }

                requestFrame();
            };

            img.onerror = () => {
                loadingRef.current = { img: null, url: null };
                URL.revokeObjectURL(url);
                requestFrame();
            };

            img.src = url;
        });

        send({ type: 'start-mirror' });
        // Small delay to ensure server state is ready if needed, but the loop is self-correcting
        requestFrame();
        stalledTimer.current = setTimeout(() => setStalled(true), 3000);

        return () => {
            cleanup();
            const { img, url } = loadingRef.current;
            if (img) {
                img.onload = null;
                img.onerror = null;
                img.src = '';
            }
            if (url) {
                URL.revokeObjectURL(url);
            }
            send({ type: 'stop-mirror' });
            if (stalledTimer.current) clearTimeout(stalledTimer.current);
        };
    }, [isMirroring, addListener, send, status]);

    const handleStart = (e: React.TouchEvent) => {
        handlers.onTouchStart(e);
    };

    const handlePreventFocus = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            role="region"
            aria-label={scrollMode ? "Touch Area (Scroll Mode)" : "Touch Area (Cursor Mode)"}
            className="flex-1 bg-neutral-900 relative touch-none select-none flex items-center justify-center overflow-hidden"
            onTouchStart={handleStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={handlePreventFocus}
        >
            {/* Background Canvas for Mirroring */}
            {isMirroring && (
                <div className="absolute inset-0 flex items-center justify-center p-2 opacity-60">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full object-contain pointer-events-none rounded-lg"
                    />
                    {mirrorError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-900/60 transition-all">
                            <div className="w-12 h-12 mb-3 text-error opacity-40">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest leading-relaxed">
                                {mirrorError.includes('Wayland') ? MESSAGES.UNSUPPORTED : MESSAGES.UNAVAILABLE}
                            </span>
                            <span className="text-[9px] text-neutral-500 mt-1 max-w-[180px] leading-tight">
                                {mirrorError}
                            </span>
                        </div>
                    ) : !hasFrame ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900/40">
                            <div className="loading loading-spinner loading-md text-primary"></div>
                            <span className="text-[10px] uppercase tracking-widest opacity-50 font-bold">{MESSAGES.CONNECTING}</span>
                        </div>
                    ) : null}
                    {stalled && hasFrame && !mirrorError && (
                        <div className="absolute top-4 left-4 badge badge-warning gap-2">
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                            {MESSAGES.STALLED}
                        </div>
                    )}
                </div>
            )}

            <div className={`absolute top-0 left-0 w-full h-1 ${status === 'connected' ? 'bg-success' : 'bg-error'} z-10`} />

            <div className={`text-neutral-600 text-center pointer-events-none z-10 ${isMirroring ? 'opacity-0' : 'opacity-100'}`}>
                <div className="text-4xl mb-2 opacity-20 font-black italic uppercase tracking-tighter">
                    {scrollMode ? MESSAGES.SCROLL_MODE : MESSAGES.TOUCH_AREA}
                </div>
                {isTracking && <div className="loading loading-ring loading-lg"></div>}
            </div>

            {scrollMode && (
                <div className="absolute top-4 right-4 badge badge-info z-10 font-bold">{MESSAGES.SCROLL_ACTIVE}</div>
            )}
        </div>
    );
};
