import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { useTrackpadGesture } from '../hooks/useTrackpadGesture';
import { ControlBar } from '../components/Trackpad/ControlBar';
import { ExtraKeys } from '../components/Trackpad/ExtraKeys';
import { FnKeys } from '../components/Trackpad/FnKeys';
import { MediaKeys } from '../components/Trackpad/MediaKeys';
import { TouchArea } from '../components/Trackpad/TouchArea';
import { BufferBar } from '@/components/Trackpad/Buffer';
import { ModifierState } from '@/types';

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [modifier, setModifier] = useState<ModifierState>("Release");
    const [buffer, setBuffer] = useState<string[]>([]);
    const [vh, setVh] = useState<number | null>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
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

    const { status, send, sendCombo } = useRemoteConnection();
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode, sensitivity, invertScroll);

    useEffect(() => {
        setVh(window.innerHeight);
        let lastWidth = window.innerWidth;
        const handleResize = () => {
            if (Math.abs(window.innerWidth - lastWidth) > 50) {
                lastWidth = window.innerWidth;
                setVh(window.innerHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!window.visualViewport) return;
        const fullHeight = window.innerHeight;
        const handleViewport = () => {
            const vv = window.visualViewport!;
            const diff = fullHeight - vv.height;
            setKeyboardHeight(diff > 100 ? diff : 0);
        };
        window.visualViewport.addEventListener('resize', handleViewport);
        return () => window.visualViewport?.removeEventListener('resize', handleViewport);
    }, []);

    const focusInput = () => {
        hiddenInputRef.current?.focus({ preventScroll: true });
    };

    const handleToggleKeyboard = () => {
        if (showKeyboard) {
            hiddenInputRef.current?.blur();
            setShowKeyboard(false);
        } else {
            focusInput();
            setShowKeyboard(true);
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
        if (modifier === "Hold") {
            const comboKeys = [...buffer, key];
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
            if (modifier !== "Release") {
                handleModifier(val);
            } else {
                sendText(val);
            }
            (e.target as HTMLInputElement).value = '';
        }
    };

    const sendKey = (k: string) => {
        if (modifier !== "Release") handleModifier(k);
        else send({ type: 'key', key: k });
    };

    return (
        <div
            className="grid grid-rows-[repeat(14,_minmax(0,_1fr))] w-full overflow-hidden bg-base-100"
            style={{ height: vh ? `${vh}px` : '100vh' }}
        >
            <div className="row-span-7">
                <TouchArea
                    isTracking={isTracking}
                    scrollMode={scrollMode}
                    handlers={handlers}
                    status={status}
                />
            </div>

            <div className={`row-span-1 flex items-center px-4 bg-base-200 border-b border-base-300 overflow-hidden ${bufferText === "" ? "invisible" : ""}`}>
                {bufferText !== "" && <BufferBar bufferText={bufferText} />}
            </div>

            <div className="row-span-1">
                <div style={keyboardHeight > 0 ? {
                    position: 'fixed',
                    bottom: `${keyboardHeight}px`,
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    height: vh ? `${vh / 14}px` : '7.14vh'
                } : { height: '100%' }}>
                    <ControlBar
                        scrollMode={scrollMode}
                        showKeyboard={showKeyboard}
                        modifier={modifier}
                        buffer={bufferText}
                        onToggleScroll={() => setScrollMode(!scrollMode)}
                        onLeftClick={() => handleClick('left')}
                        onRightClick={() => handleClick('right')}
                        onKeyboardToggle={handleToggleKeyboard}
                        onModifierToggle={handleModifierState}
                    />
                </div>
            </div>

            <div className="row-span-1 overflow-hidden">
                <MediaKeys sendKey={sendKey} />
            </div>

            <div className="row-span-2 overflow-hidden">
                <FnKeys sendKey={sendKey} />
            </div>

            <div className="row-span-2 relative overflow-hidden">
                <input
                    ref={hiddenInputRef}
                    className="opacity-0 absolute top-0 left-0 pointer-events-none h-px w-px"
                    onKeyDown={handleKeyDown}
                    onChange={handleInput}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                />
                <ExtraKeys sendKey={sendKey} />
            </div>
        </div>
    )
}
