import React from "react";

interface KeyDef {
    label: string;
    key: string;
}

interface KeyGridProps {
    keys: KeyDef[];
    sendKey: (key: string) => void;
    className?: string;
    buttonClass?: string;
}

export const KeyGrid: React.FC<KeyGridProps> = ({ keys, sendKey, className = "", buttonClass = "btn min-w-0 h-full" }) => {
    const handleInteract = (e: React.PointerEvent, key: string) => {
        e.preventDefault();
        sendKey(key);
    };

    return (
        <div className={`grid grid-cols-6 gap-1 p-2 h-full ${className}`}>
            {keys.map(({ label, key }) => (
                <button
                    key={key}
                    type="button"
                    className={buttonClass}
                    onPointerDown={(e) => handleInteract(e, key)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
};
