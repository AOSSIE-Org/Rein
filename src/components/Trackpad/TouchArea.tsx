import React from 'react';

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: 'connecting' | 'connected' | 'disconnected' | 'stale';
    latency: number | null;
}

export const TouchArea: React.FC<TouchAreaProps> = ({ scrollMode, isTracking, handlers, status, latency }) => {
    const handleStart = (e: React.TouchEvent) => {
        handlers.onTouchStart(e);
    };

    const handlePreventFocus = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    const getStatusColor = () => {
        switch (status) {
            case 'connected': return 'bg-success';
            case 'stale': return 'bg-warning animate-pulse';
            case 'connecting': return 'bg-info';
            default: return 'bg-error';
        }
    };

    const getLatencyColor = () => {
        if (!latency) return 'text-neutral-500';
        if (latency < 50) return 'text-success';
        if (latency < 150) return 'text-warning';
        return 'text-error';
    };

    return (
        <div
            className={`flex-1 relative touch-none select-none flex items-center justify-center p-4 transition-colors duration-500 ${status === 'stale' ? 'bg-neutral-900 opacity-80' : 'bg-neutral-800'}`}
            onTouchStart={handleStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={handlePreventFocus}
        >
            <div className={`absolute top-0 left-0 w-full h-1 transition-colors duration-500 ${getStatusColor()}`} />

            {latency !== null && status === 'connected' && (
                <div className={`absolute top-4 left-4 text-[10px] font-mono font-bold ${getLatencyColor()}`}>
                    {latency}ms
                </div>
            )}

            {status === 'stale' && (
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10">
                    <div className="badge badge-warning gap-2 py-3 px-4 shadow-xl border-none">
                        <span className="loading loading-spinner loading-xs"></span>
                        Reconnecting...
                    </div>
                    <span className="text-warning text-xs font-medium bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                        Network Link Unstable
                    </span>
                </div>
            )}

            <div className={`text-neutral-600 text-center pointer-events-none transition-all duration-300 ${status === 'stale' ? 'scale-90 blur-sm grayscale' : ''}`}>
                <div className="text-4xl mb-2 opacity-20">
                    {scrollMode ? 'Scroll Mode' : 'Touch Area'}
                </div>
                {isTracking && <div className="loading loading-ring loading-lg"></div>}
            </div>

            {scrollMode && (
                <div className="absolute top-4 right-4 badge badge-info">SCROLL Active</div>
            )}
        </div>
    );
};
