import React, { useRef } from "react";

interface ClipboardButtonsProps {
    onCopy: () => void;
    onPaste: () => void;
}

export const ClipboardButtons: React.FC<ClipboardButtonsProps> = ({
    onCopy,
    onPaste,
}) => {
    // Guard to prevent double-firing on browsers that trigger both Down and Up
    const firedRef = useRef(false);

    const handlePointerDown = (e: React.PointerEvent, action: () => void, label: string) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[UI] ${label} Button - PointerDown triggered`);
        firedRef.current = true;
        action(); // Primary trigger for immediate response
    };

    const handlePointerUp = (e: React.PointerEvent, action: () => void, label: string) => {
        e.preventDefault();
        e.stopPropagation();
        // Fallback for iOS Safari where PointerDown might be swallowed
        if (!firedRef.current) {
            console.log(`[UI] ${label} Button - PointerUp fallback triggered`);
            action();
        }
        firedRef.current = false;
    };

    return (
        <>
            <button
                className="btn btn-sm btn-outline"
                onPointerDown={(e) => handlePointerDown(e, onCopy, "Copy")}
                onPointerUp={(e) => handlePointerUp(e, onCopy, "Copy")}
            >
                Copy
            </button>
            <button
                className="btn btn-sm btn-outline"
                onPointerDown={(e) => handlePointerDown(e, onPaste, "Paste")}
                onPointerUp={(e) => handlePointerUp(e, onPaste, "Paste")}
            >
                Paste
            </button>
        </>
    );
};