import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useRemoteConnection } from '@/hooks/useRemoteConnection';
// TODO: FloatingMirror is currently preserved as an alternative to integrated mirroring.
// It could be moved to a toggleable 'PIP Mode' in the future.
import { useTrackpadGesture } from '@/hooks/useTrackpadGesture';
import { ControlBar } from '@/components/Trackpad/ControlBar';
import { ExtraKeys } from '@/components/Trackpad/ExtraKeys';
import { TouchArea } from '@/components/Trackpad/TouchArea';

import { BufferBar } from '@/components/Trackpad/Buffer';
import { ModifierState } from '@/types';

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const [modifier, setModifier] = useState<ModifierState>("Release");
    const [buffer, setBuffer] = useState<string[]>([]);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [extraKeysVisible, setExtraKeysVisible] = useState(true);
    const [isMirroring] = useState(true);
    const bufferText = buffer.join(" + ");
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const isComposingRef = useRef(false);

    const [sensitivity] = useState(() => {
        if (typeof window === 'undefined') return 1.0;
        const s = localStorage.getItem('rein_sensitivity');
        return s ? parseFloat(s) : 1.0;
    });

    const [invertScroll] = useState(() => {
        if (typeof window === 'undefined') return false;
        const s = localStorage.getItem('rein_invert');
        return s ? JSON.parse(s) : false;
    });

    const { status, send, sendCombo, addListener } = useRemoteConnection();
    // Pass sensitivity and invertScroll to the gesture hook
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode, sensitivity, invertScroll);

    // When keyboardOpen changes, focus or blur the hidden input
    useEffect(() => {
        if (keyboardOpen) {
            hiddenInputRef.current?.focus();
        } else {
            hiddenInputRef.current?.blur();
        }
    }, [keyboardOpen]);

    const toggleKeyboard = () => {
        setKeyboardOpen(prev => !prev);
    };

    // Silent focus for ExtraKeys — does NOT open mobile keyboard
    // ExtraKeys send via callback so they don't actually need input focus,
    // but keep this in case it's used elsewhere.
    const focusInputSilent = () => {
        if (keyboardOpen) {
            hiddenInputRef.current?.focus();
        }
    };

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true });
        setTimeout(() => send({ type: 'click', button, press: false }), 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const key = e.key.toLowerCase();

        if (modifier !== "Release") {
            if (key === 'backspace') {
                e.preventDefault();
                setBuffer(prev => prev.slice(0, -1));
                return;
            }
            if (key === 'escape') {
                e.preventDefault();
                setModifier("Release");
                setBuffer([]);
                return;
            }
            if (key !== 'unidentified' && key.length > 1) {
                e.preventDefault();
                handleModifier(key);
            }
            return;
        }

        if (key === 'backspace') send({ type: 'key', key: 'backspace' });
        else if (key === 'enter') send({ type: 'key', key: 'enter' });
        else if (key !== 'unidentified' && key.length > 1) {
            send({ type: 'key', key });
        }
    };

    const handleModifierState = () => {
        switch (modifier) {
            case "Active":
                if (buffer.length > 0) {
                    setModifier("Hold");
                } else {
                    setModifier("Release");
                }
                break;
            case "Hold":
                setModifier("Release");
                setBuffer([]);
                break;
            case "Release":
                setModifier("Active");
                setBuffer([]);
                break;
        }
    };

    const handleModifier = (key: string) => {
        console.log(`handleModifier called with key: ${key}, current modifier: ${modifier}, buffer:`, buffer);

        if (modifier === "Hold") {
            const comboKeys = [...buffer, key];
            console.log(`Sending combo:`, comboKeys);
            sendCombo(comboKeys);
            return;
        } else if (modifier === "Active") {
            setBuffer(prev => [...prev, key]);
            return;
        }
    };


    const sendText = (val: string) => {
        if (!val) return;
        const toSend = val.length > 1 ? `${val} ` : val;
        send({ type: 'text', text: toSend });
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isComposingRef.current) return;
        const val = e.target.value;
        if (val) {
            e.target.value = '';
            if (modifier !== "Release") {
                handleModifier(val);
            } else {
                sendText(val);
            }
        }
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        const val = (e.target as HTMLInputElement).value;
        if (val) {
            modifier !== "Release" ? handleModifier(val) : sendText(val);
            (e.target as HTMLInputElement).value = '';
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-base-300 overflow-hidden">

            {/* TOUCH AREA */}
            <div className="flex-1 min-h-0 relative flex flex-col border-b border-base-200">
                <TouchArea
                    isTracking={isTracking}
                    scrollMode={scrollMode}
                    handlers={handlers}
                    status={status}
                    isMirroring={isMirroring}
                    send={send}
                    addListener={addListener}
                />

                {bufferText && (
                    <div className="absolute bottom-4 left-0 right-0 px-4 z-20">
                        <BufferBar bufferText={bufferText} />
                    </div>
                )}
            </div>

            {/* CONTROL BAR */}
            <div className="shrink-0 border-b border-base-200">
                <ControlBar
                    scrollMode={scrollMode}
                    modifier={modifier}
                    buffer={bufferText}
                    keyboardOpen={keyboardOpen}
                    extraKeysVisible={extraKeysVisible}
                    onToggleScroll={() => setScrollMode(!scrollMode)}
                    onLeftClick={() => handleClick('left')}
                    onRightClick={() => handleClick('right')}
                    onKeyboardToggle={toggleKeyboard}
                    onModifierToggle={handleModifierState}
                    onExtraKeysToggle={() => setExtraKeysVisible(prev => !prev)}
                />
            </div>

            {/* EXTRA KEYS */}
            <div
                className={`shrink-0 overflow-hidden transition-all duration-300
                ${(!extraKeysVisible || keyboardOpen)
                        ? "max-h-0 opacity-0 pointer-events-none"
                        : "max-h-[50vh] opacity-100"
                    }`}
            >
                <ExtraKeys
                    sendKey={(k) => {
                        if (modifier !== "Release") handleModifier(k);
                        else send({ type: 'key', key: k });
                    }}
                    onInputFocus={focusInputSilent}
                />
            </div>

            {/* HIDDEN INPUT — focused when keyboard is open, works for both mobile (native keyboard) and laptop (physical keyboard) */}
            <input
                ref={hiddenInputRef}
                className="absolute bottom-0 w-0 h-0 opacity-0 pointer-events-none"
                onKeyDown={handleKeyDown}
                onChange={handleInput}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
            />
        </div>
    );
}
