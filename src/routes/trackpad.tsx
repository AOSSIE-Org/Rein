import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect, useCallback } from 'react'
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
    // Use ref for immediate sync access (no async state delay)
    const keyboardOpenRef = useRef(false);

    const { status, send } = useRemoteConnection();
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode);

    // Sync keyboard state from viewport resize (handles back button dismissal)
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const syncKeyboardState = () => {
            const isVisible = viewport.height < window.innerHeight * 0.85;
            keyboardOpenRef.current = isVisible;
        };
        
        viewport.addEventListener('resize', syncKeyboardState);
        return () => viewport.removeEventListener('resize', syncKeyboardState);
    }, []);

    const toggleKeyboard = useCallback(() => {
        const input = hiddenInputRef.current;
        if (!input) return;
        
        // Read from ref for immediate accurate value
        if (keyboardOpenRef.current) {
            input.blur();
            keyboardOpenRef.current = false;
        } else {
            input.focus();
            keyboardOpenRef.current = true;
        }
    }, []);

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true });
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

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) {
            send({ type: 'text', text: val.slice(-1) });
            e.target.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />
            <ControlBar
                scrollMode={scrollMode}
                onToggleScroll={() => setScrollMode(!scrollMode)}
                onLeftClick={() => handleClick('left')}
                onRightClick={() => handleClick('right')}
                onKeyboardToggle={toggleKeyboard}
            />
            <ExtraKeys sendKey={(k) => send({ type: 'key', key: k })} />
            <input
                ref={hiddenInputRef}
                className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
                onKeyDown={handleKeyDown}
                onChange={handleInput}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
            />
        </div>
    )
}
