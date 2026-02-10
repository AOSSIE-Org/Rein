import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef } from 'react';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { useTrackpadGesture } from '../hooks/useTrackpadGesture';
import { ControlBar } from '../components/Trackpad/ControlBar';
import { ExtraKeys } from '../components/Trackpad/ExtraKeys';
import { TouchArea } from '../components/Trackpad/TouchArea';

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage
});

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    const { status, send } = useRemoteConnection();
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode);

    const focusInput = () => hiddenInputRef.current?.focus();

    const handleContainerClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            focusInput();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            send({ type: 'key', key: 'backspace' });
        }
    };

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            onClick={handleContainerClick}
        >
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />

            <ControlBar
                scrollMode={scrollMode}
                onToggleScroll={() => setScrollMode(!scrollMode)}
                onLeftClick={() =>
                    send({ type: 'click', button: 'left', press: true })
                }
                onRightClick={() =>
                    send({ type: 'click', button: 'right', press: true })
                }
                onKeyboardToggle={focusInput}
            />

            <ExtraKeys
                sendKey={(k) => send({ type: 'key', key: k })}
                onInputFocus={focusInput}
            />

            <input
                ref={hiddenInputRef}
                className="opacity-0 absolute bottom-0 h-0 w-0 pointer-events-none"
                onKeyDown={handleKeyDown}
                onChange={(e) => {
                    if (e.target.value) {
                        send({ type: 'text', text: e.target.value });
                        e.target.value = '';
                    }
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                autoFocus
            />
        </div>
    );
}
