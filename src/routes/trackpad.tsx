import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { useTrackpadGesture } from '../hooks/useTrackpadGesture';
import { ControlBar } from '../components/Trackpad/ControlBar';
import { ExtraKeys } from '../components/Trackpad/ExtraKeys';
import { TouchArea } from '../components/Trackpad/TouchArea';
import { BufferBar } from '@/components/Trackpad/Buffer';
import { ModifierState } from '@/types';

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const [modifier, setModifier] = useState<ModifierState>("Release");
    const [buffer, setBuffer] = useState<string[]>([]);
    const bufferText = buffer.join(" + ");
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    // Load Client Settings
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

    const { status, send, sendCombo } = useRemoteConnection();
    // Pass sensitivity and invertScroll to the gesture hook
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode, sensitivity, invertScroll);

    const toggleKeyboard = () => {
        if (keyboardOpen) {
            hiddenInputRef.current?.blur();
        } else {
            hiddenInputRef.current?.focus();
        }
        setKeyboardOpen(!keyboardOpen);
    };

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true });
        // Release after short delay to simulate click
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

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
        >
            {/* Touch Surface */}
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />
            {bufferText !== "" && <BufferBar bufferText={bufferText} />}

            {/* Controls */}
            <ControlBar
                scrollMode={scrollMode}
                modifier={modifier}
                buffer={buffer.join(" + ")}
                onToggleScroll={() => setScrollMode(!scrollMode)}
                onLeftClick={() => handleClick('left')}
                onRightClick={() => handleClick('right')}
                onKeyboardToggle={toggleKeyboard}
                onModifierToggle={handleModifierState}
            />

            {/* Extra Keys */}
            <ExtraKeys
                sendKey={(k) => {
                    if (modifier !== "Release") handleModifier(k);
                    else send({ type: 'key', key: k });
                }}
                onInputFocus={() => hiddenInputRef.current?.focus()}
            />

            {/* Hidden Input for Mobile Keyboard */}
            <input
                ref={hiddenInputRef}
                className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
                onKeyDown={handleKeyDown}
                onChange={handleInput}
                onBlur={() => setKeyboardOpen(false)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
            />
        </div>
    )
}
