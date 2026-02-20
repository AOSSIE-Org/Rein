import React from 'react';

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: 'connecting' | 'connected' | 'disconnected';
}

export const TouchArea: React.FC<TouchAreaProps> = ({ scrollMode, isTracking, handlers, status }) => {
    const handleStart = (e: React.TouchEvent) => {
        handlers.onTouchStart(e);
    };

    const handlePreventFocus = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            className="flex-1 bg-neutral-800 relative touch-none select-none flex items-center justify-center p-4"
            onTouchStart={handleStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={handlePreventFocus}
        >
            <div className={`absolute top-0 left-0 w-full h-1 ${status === 'connected' ? 'bg-success' : 'bg-error'}`} />

            <div className="text-neutral-600 text-center pointer-events-none">
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
