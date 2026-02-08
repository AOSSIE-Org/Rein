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
    const [pinInput, setPinInput] = useState('');

    const { status, send, isAuthenticated, authRequired, authenticate, authError } = useRemoteConnection();
    const { isTracking, handlers } = useTrackpadGesture(send, scrollMode);

    if (status === 'connecting') {
        return (
            <div className="h-full flex items-center justify-center p-6 bg-base-100">
                <div className="flex flex-col items-center space-y-4">
                    <span className="loading loading-spinner loading-lg text-primary"></span>
                    <p className="opacity-70">Connecting to server...</p>
                </div>
            </div>
        );
    }

    if (status === 'disconnected') {
        return (
            <div className="h-full flex items-center justify-center p-6 bg-base-100">
                <div className="text-center space-y-4">
                    <div className="text-error">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold">Disconnected</h2>
                    <p className="opacity-70">Connection lost. Reconnecting...</p>
                </div>
            </div>
        );
    }

    if (authRequired && !isAuthenticated) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 space-y-6 bg-base-100">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold">Authentication</h2>
                    <p className="opacity-70">Enter the PIN shown on your desktop.</p>
                </div>

                <div className="form-control w-full max-w-xs">
                    <input
                        type="tel"
                        className="input input-bordered w-full text-center text-4xl tracking-[0.5em] font-mono h-16"
                        placeholder="000000"
                        maxLength={6}
                        value={pinInput}
                        onChange={e => setPinInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') authenticate(pinInput);
                        }}
                    />
                </div>

                <button
                    className="btn btn-primary w-full max-w-xs btn-lg"
                    onClick={() => authenticate(pinInput)}
                    disabled={pinInput.length < 6}
                >
                    Connect
                </button>

                {authError && (
                    <div className="alert alert-error shadow-lg max-w-xs">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>Incorrect PIN</span>
                    </div>
                )}
            </div>
        )
    }

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

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) {
            send({ type: 'text', text: val.slice(-1) });
            e.target.value = '';
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
