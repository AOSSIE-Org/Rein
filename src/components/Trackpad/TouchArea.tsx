import React from 'react';

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: any; // Accepts the spreadable event handlers from @use-gesture/react
    status: 'connecting' | 'connected' | 'disconnected';
}

export const TouchArea: React.FC<TouchAreaProps> = ({ scrollMode, isTracking, handlers, status }) => {
    
    const handlePreventFocus = (e: React.MouseEvent) => {
        e.preventDefault();
        // If the library handlers need onMouseDown, we call it manually
        if (handlers.onMouseDown) {
            handlers.onMouseDown(e);
        }
    };

    return (
        <div
            className="flex-1 bg-neutral-800 relative touch-none select-none flex items-center justify-center p-4"
            {...handlers}
            onMouseDown={handlePreventFocus}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className={`absolute top-0 left-0 w-full h-1 ${status === 'connected' ? 'bg-success' : 'bg-error'}`} />

            <div className="text-neutral-600 text-center pointer-events-none">
                <div className="text-4xl mb-2 opacity-20">
                    {scrollMode ? 'Scroll Mode' : 'Touch Area'}
                </div>
            </div>

            {scrollMode && (
                <div className="absolute top-4 right-4 badge badge-info">SCROLL Active</div>
            )}
        </div>
    );
};
