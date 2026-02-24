import { ModifierState } from "@/types";
import React from "react";

interface ControlBarProps {
    scrollMode: boolean;
    modifier: ModifierState;
    buffer: string;
    onToggleScroll: () => void;
    onLeftClick: () => void;
    onRightClick: () => void;
    onKeyboardToggle: () => void;
    onModifierToggle: () => void;
    keyboardOpen: boolean;
    extraKeysVisible: boolean;
    onExtraKeysToggle: () => void;
}

const CursorIcon = () => (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 1 L3 17 L7 13 L10 19 L12.5 18 L9.5 12 L15 12 Z" />
    </svg>
);

const MouseIcon = ({ side }: { side: "L" | "R" }) => (
    <div className="flex items-center gap-[3px] leading-none">
        <svg width="14" height="18" viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="0.7" y="0.7" width="12.6" height="20.6" rx="6.3" />
            <line x1="7" y1="0.7" x2="7" y2="10.5" />
            {side === "L"
                ? <rect x="0.7" y="0.7" width="6.3" height="9.8" rx="6.3" fill="currentColor" opacity="0.4" stroke="none" />
                : <rect x="7" y="0.7" width="6.3" height="9.8" rx="6.3" fill="currentColor" opacity="0.4" stroke="none" />}
        </svg>
        <span className="text-[12px] font-extrabold">{side}</span>
    </div>
);

const CopyIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const PasteIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
);

const KeyboardIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="2" y="6" width="20" height="12" rx="2" />

        {/* Top row keys */}
        <circle cx="6" cy="10" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="14" cy="10" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="18" cy="10" r="0.9" fill="currentColor" stroke="none" />

        {/* Bottom row */}
        <circle cx="6" cy="14" r="0.9" fill="currentColor" stroke="none" />
        <line x1="9" y1="14" x2="15" y2="14" strokeWidth="1.8" />
        <circle cx="18" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </svg>
);

export const ControlBar: React.FC<ControlBarProps> = ({
    scrollMode,
    modifier,
    onToggleScroll,
    onLeftClick,
    onRightClick,
    onKeyboardToggle,
    onModifierToggle,
}) => {

    const prevent = (e: React.PointerEvent, cb: () => void) => {
        e.preventDefault();
        cb();
    };

    const getHoldClass = () => {
        if (modifier === "Active") return "bg-success text-white";
        if (modifier === "Hold") return "bg-warning text-white";
        return "bg-transparent text-base-content";
    };

    const baseBtn =
        "flex-1 min-w-0 flex items-center justify-center py-[11px] " +
        "select-none touch-none overflow-hidden box-border cursor-pointer " +
        "border-0 outline-none bg-transparent text-[#c8d0e8]";

    return (
        <div className="flex items-stretch w-full bg-base-200 border-b border-base-300">

            <button
                className={`${baseBtn} ${scrollMode ? "text-primary" : ""}`}
                onPointerDown={(e) => prevent(e, onToggleScroll)}
            >
                <CursorIcon />
            </button>

            <button
                className={baseBtn}
                onPointerDown={(e) => prevent(e, onLeftClick)}
            >
                <MouseIcon side="L" />
            </button>

            <button
                className={baseBtn}
                onPointerDown={(e) => prevent(e, onRightClick)}
            >
                <MouseIcon side="R" />
            </button>

            <button className={baseBtn}>
                <CopyIcon />
            </button>

            <button className={baseBtn}>
                <PasteIcon />
            </button>

            <button
                className={baseBtn}
                onPointerDown={(e) => prevent(e, onKeyboardToggle)}
            >
                <KeyboardIcon />
            </button>

            <button
                className={`flex-none px-3 py-[11px] m-1 rounded-md text-xs font-bold 
                           ${getHoldClass()}`}
                onPointerDown={(e) => prevent(e, onModifierToggle)}
            >
                HOLD
            </button>

        </div>
    );
};
