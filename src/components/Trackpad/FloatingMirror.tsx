import { useEffect, useRef, useState, useCallback } from 'react';

import { WSMessage } from '@/hooks/useRemoteConnection';

interface FloatingMirrorProps {
    addListener: (l: (msg: WSMessage) => void) => () => void;
    send: (msg: WSMessage) => void;
    onClose: () => void;
}

const MIN_W = 120;
const MIN_H = 90;
const DEFAULT_W = 220;
const DEFAULT_H = 165;

export function FloatingMirror({ addListener, send, onClose }: FloatingMirrorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Position & size state
    const [pos, setPos] = useState({ x: 16, y: 120 });
    const posRef = useRef(pos);
    const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

    // Keep posRef in sync for drag calculations without dependency churn
    useEffect(() => {
        posRef.current = pos;
    }, [pos]);

    // FPS & stall & loading
    const [fps, setFps] = useState(0);
    const [stalled, setStalled] = useState(false);
    const [hasFrame, setHasFrame] = useState(false);
    const frameCount = useRef(0);
    const lastFpsCalc = useRef(Date.now());
    const stalledTimer = useRef<NodeJS.Timeout | null>(null);

    // ── Drag to move ──────────────────────────────────────────
    const dragStart = useRef<{ touchId: number; ox: number; oy: number } | null>(null);

    const onDragStart = useCallback((e: React.TouchEvent) => {
        // Only handle if not resizing (resize uses 2nd touch)
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        dragStart.current = {
            touchId: t.identifier,
            ox: t.clientX - posRef.current.x,
            oy: t.clientY - posRef.current.y,
        };
        e.stopPropagation();
    }, []); // No more pos dependency

    const onDragMove = useCallback((e: React.TouchEvent) => {
        if (!dragStart.current || e.touches.length !== 1) return;
        const t = Array.from(e.touches).find(t => t.identifier === dragStart.current!.touchId);
        if (!t) return;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const newX = Math.max(0, Math.min(vw - size.w, t.clientX - dragStart.current.ox));
        const newY = Math.max(0, Math.min(vh - size.h, t.clientY - dragStart.current.oy));

        setPos({ x: newX, y: newY });
        e.stopPropagation();
        e.preventDefault();
    }, [size]);

    const onDragEnd = useCallback((e: React.TouchEvent) => {
        dragStart.current = null;
        e.stopPropagation();
    }, []);

    // ── Resize handle (bottom-right corner) ───────────────────
    const resizeStart = useRef<{ touchId: number; startX: number; startY: number; startW: number; startH: number } | null>(null);

    const onResizeStart = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        resizeStart.current = {
            touchId: t.identifier,
            startX: t.clientX,
            startY: t.clientY,
            startW: size.w,
            startH: size.h,
        };
        e.stopPropagation();
        e.preventDefault();
    }, [size]);

    const onResizeMove = useCallback((e: React.TouchEvent) => {
        if (!resizeStart.current) return;
        const t = Array.from(e.touches).find(t => t.identifier === resizeStart.current!.touchId);
        if (!t) return;

        const dx = t.clientX - resizeStart.current.startX;
        const dy = t.clientY - resizeStart.current.startY;

        const newW = Math.max(MIN_W, resizeStart.current.startW + dx);
        const newH = Math.max(MIN_H, resizeStart.current.startH + dy);
        setSize({ w: newW, h: newH });
        e.stopPropagation();
        e.preventDefault();
    }, []);

    const onResizeEnd = useCallback((e: React.TouchEvent) => {
        resizeStart.current = null;
        e.stopPropagation();
    }, []);

    // ── Frame loop ────────────────────────────────────────────
    const cursorRef = useRef<{ fx: number; fy: number } | null>(null);

    useEffect(() => {
        const requestFrame = () => send({ type: 'request-frame' });

        const cleanup = addListener((msg: any) => {
            // Store latest cursor position (arrives just before the binary frame)
            if (msg.type === 'cursor-pos') {
                cursorRef.current = { fx: msg.fx, fy: msg.fy };
                return;
            }

            if (msg.type !== 'mirror-frame-bin' || !msg.data) return;

            if (stalledTimer.current) clearTimeout(stalledTimer.current);
            setStalled(false);
            stalledTimer.current = setTimeout(() => setStalled(true), 3000);

            const blob = new Blob([msg.data], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
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

                // Draw cursor on canvas (in frame pixel coords)
                const cur = cursorRef.current;
                if (cur) {
                    const r = 6;
                    ctx.save();
                    // outer black ring
                    ctx.beginPath();
                    ctx.arc(cur.fx, cur.fy, r + 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fill();
                    // inner white dot
                    ctx.beginPath();
                    ctx.arc(cur.fx, cur.fy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.fill();
                    // crosshair lines
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cur.fx - r - 4, cur.fy);
                    ctx.lineTo(cur.fx + r + 4, cur.fy);
                    ctx.moveTo(cur.fx, cur.fy - r - 4);
                    ctx.lineTo(cur.fx, cur.fy + r + 4);
                    ctx.stroke();
                    ctx.restore();
                }

                frameCount.current++;
                const now = Date.now();
                if (now - lastFpsCalc.current > 1000) {
                    setFps(Math.round((frameCount.current * 1000) / (now - lastFpsCalc.current)));
                    frameCount.current = 0;
                    lastFpsCalc.current = now;
                }
                requestFrame();
            };

            // If the frame is corrupt / can't decode, keep the loop alive anyway
            img.onerror = () => {
                URL.revokeObjectURL(url);
                requestFrame();
            };

            img.src = url;
        });

        send({ type: 'start-mirror' });
        requestFrame();
        stalledTimer.current = setTimeout(() => setStalled(true), 3000);

        return () => {
            cleanup();
            send({ type: 'stop-mirror' });
            if (stalledTimer.current) clearTimeout(stalledTimer.current);
        };
    }, [addListener, send]);

    return (
        <div
            ref={containerRef}
            className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border border-white/10"
            style={{
                left: pos.x,
                top: pos.y,
                width: size.w,
                height: size.h,
                touchAction: 'none',
            }}
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
        >
            {/* Canvas */}
            <div className="w-full h-full bg-black">
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain"
                />
                {/* Loading spinner until first frame */}
                {!hasFrame && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                        <span className="text-[9px] text-white/40 font-mono">Connecting…</span>
                    </div>
                )}
            </div>

            {/* Top bar (close + fps) */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                <span className="text-[9px] font-mono text-white/50">
                    {stalled ? '⚠ Stalled' : fps > 0 ? `${fps} fps` : '…'}
                </span>
                <button
                    type="button"
                    className="pointer-events-auto w-4 h-4 rounded-full bg-red-500/80 hover:bg-red-400 flex items-center justify-center text-[8px] text-white leading-none"
                    onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
                    aria-label="Close mirroring window"
                >
                    ✕
                </button>
            </div>

            {/* Resize handle (bottom-right) */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize touch-none flex items-end justify-end pr-1 pb-1"
                onTouchStart={onResizeStart}
                onTouchMove={onResizeMove}
                onTouchEnd={onResizeEnd}
            >
                {/* visual grip dots */}
                <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-50">
                    <title>Resize window</title>
                    <circle cx="8" cy="8" r="1.2" fill="white" />
                    <circle cx="4.5" cy="8" r="1.2" fill="white" />
                    <circle cx="8" cy="4.5" r="1.2" fill="white" />
                </svg>
            </div>
        </div>
    );
}
