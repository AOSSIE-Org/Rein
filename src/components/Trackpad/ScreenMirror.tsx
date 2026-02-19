import { useEffect, useRef, useState } from 'react';

interface ScreenMirrorProps {
    addListener: (l: (msg: any) => void) => () => void;
    send: (msg: any) => void;
    isActive: boolean;
}

export function ScreenMirror({ addListener, send, isActive }: ScreenMirrorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [fps, setFps] = useState(0);
    const [stalled, setStalled] = useState(false);
    const frameCount = useRef(0);
    const lastFpsCalc = useRef(Date.now());
    const stalledTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isActive) return;

        const requestFrame = () => send({ type: 'request-frame' });

        const cleanup = addListener((msg: any) => {
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

                frameCount.current++;
                const now = Date.now();
                if (now - lastFpsCalc.current > 1000) {
                    setFps(Math.round((frameCount.current * 1000) / (now - lastFpsCalc.current)));
                    frameCount.current = 0;
                    lastFpsCalc.current = now;
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
    }, [isActive, addListener, send]);

    if (!isActive) return null;

    return (
        <div className="absolute inset-0 bg-black z-10">
            <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 text-white/50 text-xs font-mono">
                {stalled ? '⚠ Stalled' : fps > 0 ? `${fps} fps` : '…'}
            </div>
        </div>
    );
}
