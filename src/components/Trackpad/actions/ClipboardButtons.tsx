import React, { useRef } from "react";

interface ClipboardButtonsProps {
    onCopy: () => void;
    onPaste: () => void;
}

export const ClipboardButtons: React.FC<ClipboardButtonsProps> = ({
    onCopy,
    onPaste,
}) => {
    const firedRef = useRef(false);

    const handlePointerDown = (e: React.PointerEvent, action: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = true;
        action();
    };

    const handlePointerUp = (e: React.PointerEvent, action: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        if (!firedRef.current) {
            action();
        }
        firedRef.current = false;
    };

    return (
        <>
            <button
                className="btn btn-sm btn-outline"
                onPointerDown={(e) => handlePointerDown(e, onCopy)}
                onPointerUp={(e) => handlePointerUp(e, onCopy)}
            >
                Copy
            </button>
            <button
                className="btn btn-sm btn-outline"
                onPointerDown={(e) => handlePointerDown(e, onPaste)}
                onPointerUp={(e) => handlePointerUp(e, onPaste)}
            >
                Paste
            </button>
        </>
    );
};