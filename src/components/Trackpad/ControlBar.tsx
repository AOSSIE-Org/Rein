import { ModifierState } from "@/types";
import React from "react";
import { ClipboardButtons } from "./actions/ClipboardButtons";

interface ControlBarProps {
	scrollMode: boolean;
	modifier: ModifierState;
	buffer: string;
	onToggleScroll: () => void;
	onLeftClick: () => void;
	onRightClick: () => void;
	onKeyboardToggle: () => void;
	onModifierToggle: () => void;
	onPaste: () => void;
	onCopy: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
	onPaste,
	onCopy,
}) => {
    const handleInteraction = (e: React.PointerEvent, action: () => void, label: string) => {
        e.preventDefault();
        console.log(`[ControlBar] ${label} clicked`);
        action();
    };

    const getModifierButtonClass = () => {
        switch (modifier) {
            case "Active":
                if (buffer.length > 0) return "btn-success";
                else return "btn-warning";
            case "Hold":
                return "btn-warning";
            case "Release":
            default:
                return "btn-secondary";
        }
    };

    const getModifierLabel = () => {
        switch (modifier) {
            case "Active":
                if (buffer.length > 0) return "Press";
                else return "Release";
            case "Hold":
                return "Release";
            case "Release":
                return "Hold";
        }
    };

    return (
        <div className="bg-base-200 p-2 grid grid-cols-6 gap-2 shrink-0">
            <button
                className={`btn btn-sm ${scrollMode ? "btn-primary" : "btn-outline"}`}
                onPointerDown={(e) => handleInteraction(e, onToggleScroll, "ToggleScroll")}
            >
                {scrollMode ? "Scroll" : "Cursor"}
            </button>

            <ClipboardButtons onCopy={onCopy} onPaste={onPaste} />

            <button
                className="btn btn-sm btn-outline"
                onPointerDown={(e) => handleInteraction(e, onRightClick, "RightClick")}
            >
                R-Click
            </button>
            <button
                className={`btn btn-sm ${getModifierButtonClass()}`}
                onPointerDown={(e) => handleInteraction(e, onModifierToggle, "ModifierToggle")}
            >
                {getModifierLabel()}
            </button>
            <button
                className="btn btn-sm btn-secondary"
                onPointerDown={(e) => handleInteraction(e, onKeyboardToggle, "KeyboardToggle")}
            >
                Keyboard
            </button>
        </div>
    );
};