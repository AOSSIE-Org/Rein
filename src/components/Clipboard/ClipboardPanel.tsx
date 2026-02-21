import React, { useState } from 'react';

interface ClipboardPanelProps {
    pcClipboard: string;
    isBusy: boolean;
    onReadFromPC: () => void;
    onSendToPC: (text: string) => void;
    onClose: () => void;
}

/**
 * Slide-up panel for clipboard sync — shows PC clipboard text and lets
 * the user send their own text to the PC's clipboard.
 */
export const ClipboardPanel: React.FC<ClipboardPanelProps> = ({
    pcClipboard,
    isBusy,
    onReadFromPC,
    onSendToPC,
    onClose,
}) => {
    const [inputText, setInputText] = useState('');

    const handleSend = () => {
        if (!inputText.trim()) return;
        onSendToPC(inputText.trim());
        setInputText('');
    };

    // Copy the PC clipboard contents to the phone's clipboard (where supported)
    const handleCopyLocally = async () => {
        if (!pcClipboard) return;
        try {
            await navigator.clipboard.writeText(pcClipboard);
        } catch {
            // Clipboard API blocked (non-HTTPS) — fall back to select-all UX
            // The user can long-press the textarea to copy manually
        }
    };

    return (
        <div className="bg-base-300 border-t border-base-content/10 p-3 space-y-3 shrink-0 animate-slideUp">
            {/* Header */}
            <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">📋 Clipboard Sync</span>
                <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>

            {/* PC clipboard readout */}
            <div className="space-y-1">
                <div className="flex gap-2 items-center">
                    <span className="text-xs opacity-60">PC Clipboard</span>
                    <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={onReadFromPC}
                        disabled={isBusy}
                    >
                        {isBusy ? 'Reading…' : 'Refresh'}
                    </button>
                    {pcClipboard && (
                        <button
                            type="button"
                            className="btn btn-xs btn-outline"
                            onClick={handleCopyLocally}
                        >
                            Copy
                        </button>
                    )}
                </div>
                <textarea
                    readOnly
                    className="textarea textarea-bordered w-full text-sm resize-none h-20"
                    value={pcClipboard}
                    placeholder="Tap 'Refresh' to fetch PC clipboard"
                />
            </div>

            {/* Send text to PC */}
            <div className="space-y-1">
                <span className="text-xs opacity-60">Send to PC</span>
                <div className="flex gap-2">
                    <input
                        type="text"
                        className="input input-bordered input-sm flex-1"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type or paste text here…"
                    />
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleSend}
                        disabled={isBusy || !inputText.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};
