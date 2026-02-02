import React, { useState, useRef } from 'react';

interface ExtraKeysProps {
    sendKey: (key: string) => void;
}

const KEYS = ['Esc', 'Tab', 'Ctrl', 'Alt', 'Shift', 'Meta', 'Home', 'End', 'PgUp', 'PgDn', 'Del'];
const MOVE_THRESHOLD = 10;

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey }) => {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef(false);

    const handlePointerDown = (e: React.PointerEvent, key: string) => {
        // Prevent ALL focus changes
        e.preventDefault();
        e.stopPropagation();
        startPosRef.current = { x: e.clientX, y: e.clientY };
        hasMoved.current = false;
        setActiveKey(key);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!startPosRef.current) return;
        const dx = Math.abs(e.clientX - startPosRef.current.x);
        const dy = Math.abs(e.clientY - startPosRef.current.y);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
            hasMoved.current = true;
            setActiveKey(null);
        }
    };

    const handlePointerUp = (e: React.PointerEvent, key: string) => {
        // Prevent focus changes on up event too
        e.preventDefault();
        e.stopPropagation();

        if (!hasMoved.current && activeKey === key) {
            sendKey(key.toLowerCase());
        }
        startPosRef.current = null;
        hasMoved.current = false;
        setActiveKey(null);
    };

    const handlePointerLeave = () => {
        startPosRef.current = null;
        hasMoved.current = false;
        setActiveKey(null);
    };

    return (
        <div className="bg-base-300 py-2 px-2 overflow-x-auto whitespace-nowrap shrink-0 flex gap-2 hide-scrollbar border-t border-base-content/10">
            {KEYS.map(k => (
                <button
                    key={k}
                    className={`
                        min-w-14 h-10 rounded-lg text-sm font-semibold
                        flex items-center justify-center
                        transition-all duration-100
                        select-none touch-manipulation
                        shadow-sm
                        ${activeKey === k
                            ? 'bg-primary text-primary-content scale-95 shadow-inner'
                            : 'bg-base-100 text-base-content hover:bg-base-200 active:scale-95'
                        }
                    `}
                    onPointerDown={(e) => handlePointerDown(e, k)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(e) => handlePointerUp(e, k)}
                    onPointerLeave={handlePointerLeave}
                    onPointerCancel={handlePointerLeave}
                >
                    {k}
                </button>
            ))}
        </div>
    );
};
