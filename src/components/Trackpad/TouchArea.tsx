import React, { useEffect, useRef, useState } from 'react';

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
    addListener?: (l: (msg: any) => void) => () => void;
    send?: (msg: any) => void;
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
    const stalledTimer = useRef<NodeJS.Timeout | null>(null);

    // Mirroring Frame Loop
    useEffect(() => {
        if (!isMirroring || !addListener || !send) {
            setHasFrame(false);
            setStalled(false);
            return;
        }

        const requestFrame = () => send({ type: 'request-frame' });

        const cleanup = addListener((msg: any) => {
            if (msg.type === 'cursor-pos') {
                cursorRef.current = { fx: msg.fx, fy: msg.fy };
                return;
            }

            if (!(msg instanceof Uint8Array || msg instanceof Blob || (msg.type === 'mirror-frame-bin' && msg.data))) {
                return;
            }

            // Handle both raw binary (if sent directly) and wrapped binary
            const frameData = (msg instanceof Uint8Array || msg instanceof Blob) ? msg : msg.data;

            if (stalledTimer.current) clearTimeout(stalledTimer.current);
            setStalled(false);
            stalledTimer.current = setTimeout(() => setStalled(true), 3000);

            const blob = new Blob([frameData], { type: 'image/jpeg' });
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
                if (!hasFrame) setHasFrame(true);

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
    }, [isMirroring, addListener, send]);

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
                    {!hasFrame && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900/40">
                            <div className="loading loading-spinner loading-md text-primary"></div>
                            <span className="text-[10px] uppercase tracking-widest opacity-50 font-bold">Connecting Mirror...</span>
                        </div>
                    )}
                    {stalled && hasFrame && (
                        <div className="absolute top-4 left-4 badge badge-warning gap-2">
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                            Stalled
                        </div>
                    )}
                </div>
            )}

            <div className={`absolute top-0 left-0 w-full h-1 ${status === 'connected' ? 'bg-success' : 'bg-error'} z-10`} />

            <div className={`text-neutral-600 text-center pointer-events-none z-10 ${isMirroring ? 'opacity-0' : 'opacity-100'}`}>
                <div className="text-4xl mb-2 opacity-20 font-black italic uppercase tracking-tighter">
                    {scrollMode ? 'Scroll Mode' : 'Touch Area'}
                </div>
                {isTracking && <div className="loading loading-ring loading-lg"></div>}
            </div>

            {scrollMode && (
                <div className="absolute top-4 right-4 badge badge-info z-10 font-bold">SCROLL ACTIVE</div>
            )}
        </div>
    );
};
