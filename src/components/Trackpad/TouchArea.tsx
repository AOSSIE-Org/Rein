import React from "react";

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: "connecting" | "connected" | "disconnected";
}

export const TouchArea: React.FC<TouchAreaProps> = ({
    scrollMode,
    isTracking,
    handlers,
    status,
}) => {
    const statusColor =
        status === "connected"
            ? "#22c55e"
            : status === "connecting"
                ? "#f59e0b"
                : "#ef4444";

    const statusLabel =
        status === "connected"
            ? "Connected"
            : status === "connecting"
                ? "Connecting..."
                : "Disconnected";

    return (
        <div
            className="flex-1 relative touch-none select-none overflow-hidden bg-[radial-gradient(ellipse_at_30%_40%,rgba(99,102,241,0.04)_0%,transparent_60%),radial-gradient(ellipse_at_70%_70%,rgba(196,24,126,0.04)_0%,transparent_60%),#080d14]"
            onTouchStart={handlers.onTouchStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={(e) => e.preventDefault()}
        >
            {/* Subtle dot grid */}
            <div
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:28px_28px] bg-[position:14px_14px]"
            />

            {/* Status bar top */}
            <div
                className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 z-10 bg-[linear-gradient(180deg,rgba(8,13,20,0.9)_0%,transparent_100%)]"
            >
                <div className="flex items-center gap-2">

                    <div className={`rounded-full w-[7px] h-[7px] ${status === "connecting" ? "animate-[var(--animate-pulse)] [animation-duration:1.2s]" : ""}`}
                        style={{
                            background: statusColor,
                            boxShadow: `0 0 6px ${statusColor}`,
                        }}
                    />
                    <span className="text-[11px] font-mono font-semibold tracking-[0.06em] uppercase opacity-90" style={{ color: statusColor,}}>{statusLabel}</span>

                </div>

                {scrollMode && (
                    <div
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.4)] text-[10px] font-bold text-[#60a5fa] tracking-[0.06em] font-mono"
                    >
                        ↕ SCROLL
                    </div>
                )}
            </div>

            {/* Active tracking ring */}
            {isTracking && (
                <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40"
                >
                    <div className="w-[60px] h-[60px] rounded-full border-[2px] border-[`#6366f1`] animate-[var(--animate-ping)] [animation-duration:0.6s] [animation-timing-function:ease-out]"
                    />
                </div>
            )}
        </div>
    );
};
