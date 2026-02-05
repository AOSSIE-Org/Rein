import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { useTrackpadGesture } from '../hooks/useTrackpadGesture';
import { ControlBar } from '../components/Trackpad/ControlBar';
import { ExtraKeys } from '../components/Trackpad/ExtraKeys';
import { TouchArea } from '../components/Trackpad/TouchArea';

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const isComposingRef = useRef(false);

    const { status, send } = useRemoteConnection();
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode);

    const focusInput = () => {
        hiddenInputRef.current?.focus();
    };

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true });
        // Release after short delay to simulate click
        setTimeout(() => send({ type: 'click', button, press: false }), 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const key = e.key.toLowerCase();
        if (key === 'backspace') send({ type: 'key', key: 'backspace' });
        else if (key === 'enter') send({ type: 'key', key: 'enter' });
        else if (key !== 'unidentified' && key.length > 1) {
            send({ type: 'key', key });
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
            sendText(val);
            e.target.value = '';
        }
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        const val = (e.target as HTMLInputElement).value;
        if (val) {
            sendText(val);
            (e.target as HTMLInputElement).value = '';
        }
    };

    const handleContainerClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            e.preventDefault();
            focusInput();
        }
    };

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            onClick={handleContainerClick}
        >
            {/* Touch Surface */}
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />

            {/* Controls */}
            <ControlBar
                scrollMode={scrollMode}
                onToggleScroll={() => setScrollMode(!scrollMode)}
                onLeftClick={() => handleClick('left')}
                onRightClick={() => handleClick('right')}
                onKeyboardToggle={focusInput}
            />

            {/* Extra Keys */}
            <ExtraKeys
                sendKey={(k) => send({ type: 'key', key: k })}
                onInputFocus={focusInput}
            />

            {/* Hidden Input for Mobile Keyboard */}
            <input
                ref={hiddenInputRef}
                className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
                onKeyDown={handleKeyDown}
                onChange={handleInput}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={() => {
                    setTimeout(() => hiddenInputRef.current?.focus(), 10);
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                autoFocus // Attempt autofocus on mount
            />
        </div>
    )
}
