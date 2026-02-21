import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useRemoteConnection } from '../hooks/useRemoteConnection'
import { useTrackpadGesture } from '../hooks/useTrackpadGesture'
import { ControlBar } from '../components/Trackpad/ControlBar'
import { ExtraKeys } from '../components/Trackpad/ExtraKeys'
import { TouchArea } from '../components/Trackpad/TouchArea'
import { BufferBar } from '@/components/Trackpad/Buffer'
import { ModifierState } from '@/types'

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false);
    const [modifier, setModifier] = useState<ModifierState>("Release");
    const [buffer, setBuffer] = useState<string[]>([]);
    const isComposingRef = useRef(false);
    const prevCompositionDataRef = useRef('');

    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : true
    )

    const [controlsVisible, setControlsVisible] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : true
    )

    const [keyboardOn, setKeyboardOn] = useState(false)

    const bufferText = buffer.join(' + ')
    const hiddenInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const toggleKeyboard = () => {
        setKeyboardOn(prev => {
            const next = !prev;

            if (next) {
                setTimeout(() => hiddenInputRef.current?.focus(), 50);
            } else {
                hiddenInputRef.current?.blur();
            }

            return next;
        });
    };

    const [sensitivity] = useState(() => {
        if (typeof window === 'undefined') return 1.0
        const s = localStorage.getItem('rein_sensitivity')
        return s ? parseFloat(s) : 1.0
    })

    const [invertScroll] = useState(() => {
        if (typeof window === 'undefined') return false
        const s = localStorage.getItem('rein_invert')
        return s ? JSON.parse(s) : false
    })

    const { status, send, sendCombo } = useRemoteConnection()
    const { isTracking, handlers } = useTrackpadGesture(
        send,
        scrollMode,
        sensitivity,
        invertScroll
    )

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true })
        setTimeout(() => send({ type: 'click', button, press: false }), 50)
    }

    const processCompositionDiff = (currentData: string, prevData: string) => {
        if (currentData === prevData) return;

        // Find common prefix length
        let commonLen = 0;
        while (
            commonLen < prevData.length &&
            commonLen < currentData.length &&
            prevData[commonLen] === currentData[commonLen]
        ) {
            commonLen++;
        }

        // Send backspaces for removed/changed characters
        const deletions = prevData.length - commonLen;
        for (let i = 0; i < deletions; i++) {
            send({ type: 'key', key: 'backspace' });
        }

        // Send new characters individually
        const newChars = currentData.slice(commonLen);
        for (const char of newChars) {
            if (modifier !== "Release") {
                handleModifier(char);
            } else {
                send({ type: 'text', text: char });
            }
        }
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
        prevCompositionDataRef.current = '';
    };

    const handleCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
        const currentData = e.data || '';
        processCompositionDiff(currentData, prevCompositionDataRef.current);
        prevCompositionDataRef.current = currentData;
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
        const currentData = e.data || '';
        processCompositionDiff(currentData, prevCompositionDataRef.current);
        prevCompositionDataRef.current = '';

        // Clear input to prevent buffer accumulation
        if (hiddenInputRef.current) {
            hiddenInputRef.current.value = '';
        }

        // Delay flag reset so the onChange firing after compositionend is suppressed
        setTimeout(() => {
            isComposingRef.current = false;
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Skip during IME composition — composition handlers manage input
        if (e.nativeEvent.isComposing || isComposingRef.current) return;

        const key = e.key.toLowerCase();

        if (modifier !== 'Release') {
            if (key === 'backspace') {
                e.preventDefault()
                setBuffer(prev => prev.slice(0, -1))
                return
            }
            if (key === 'escape') {
                e.preventDefault()
                setModifier('Release')
                setBuffer([])
                return
            }
            if (key !== 'unidentified' && key.length > 1) {
                e.preventDefault()
                handleModifier(key)
            }
            return
        }

        if (key === 'backspace') send({ type: 'key', key: 'backspace' })
        else if (key === 'enter') send({ type: 'key', key: 'enter' })
        else if (key !== 'unidentified' && key.length > 1)
            send({ type: 'key', key })
    }

    const handleModifierState = () => {
        switch (modifier) {
            case 'Active':
                if (buffer.length > 0) setModifier('Hold')
                else setModifier('Release')
                break
            case 'Hold':
                setModifier('Release')
                setBuffer([])
                break
            case 'Release':
                setModifier('Active')
                setBuffer([])
                break
        }
    }

    const handleModifier = (key: string) => {
        if (modifier === 'Hold') {
            sendCombo([...buffer, key])
        } else if (modifier === 'Active') {
            setBuffer(prev => [...prev, key])
        }
    }

    const sendText = (val: string) => {
        if (!val) return
        const toSend = val.length > 1 ? `${val} ` : val
        send({ type: 'text', text: toSend })
    }

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isComposingRef.current) return; // Skip during IME composition
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

    const handleContainerClick = (e: React.MouseEvent) => {
        if (e.currentTarget === e.target && keyboardOn) {
            hiddenInputRef.current?.focus()
        }
    }

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <div
            className="flex flex-col h-full overflow-hidden bg-[#080d14]"
            onClick={handleContainerClick}
        >
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />

            {bufferText !== '' && <BufferBar bufferText={bufferText} />}

            <div onClick={stopPropagation} onPointerDown={stopPropagation}>
                <ControlBar
                    scrollMode={scrollMode}
                    modifier={modifier}
                    buffer={bufferText}
                    keyboardOn={keyboardOn}
                    onToggleScroll={() => setScrollMode(v => !v)}
                    onLeftClick={() => handleClick('left')}
                    onRightClick={() => handleClick('right')}
                    onKeyboardToggle={toggleKeyboard}
                    onModifierToggle={handleModifierState}
                />

                {isMobile ? (
                    // MOBILE → show/hide full keyboard
                    controlsVisible && (
                        <ExtraKeys
                            sendKey={(k) => {
                                if (modifier !== 'Release') handleModifier(k);
                                else send({ type: 'key', key: k });
                            }}
                        />
                    )
                ) : (
                    // LAPTOP
                    <>
                        {/* First 3 rows always visible */}
                        <ExtraKeys
                            sendKey={(k) => {
                                if (modifier !== 'Release') handleModifier(k);
                                else send({ type: 'key', key: k });
                            }}
                            visibleRows={3}
                        />

                        {/* Remaining rows toggle (no gap) */}
                        {controlsVisible && (
                            <ExtraKeys
                                sendKey={(k) => {
                                    if (modifier !== 'Release') handleModifier(k);
                                    else send({ type: 'key', key: k });
                                }}
                                startRow={3}
                                noTopBorder
                            />
                        )}
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    setControlsVisible(v => !v)
                }}
                className="flex items-center justify-center gap-[5px] w-full pt-[5px] pb-[4px] bg-[linear-gradient(180deg,#0d1420_0%,#0a1018_100%)] border-0 border-t border-[rgba(255,255,255,0.07)] cursor-pointer text-[rgba(148,163,184,0.5)] text-[11px] font-mono font-semibold tracking-[0.1em] select-none"
            >
                <span className={`inline-block text-[10px] transition-transform duration-[250ms] ${controlsVisible ? "rotate-0" : "rotate-180"}`}>
                    ▼
                </span>

                <span>
                    {isMobile
                        ? controlsVisible
                            ? 'HIDE CONTROLS'
                            : 'SHOW CONTROLS'
                        : controlsVisible
                            ? 'HIDE MORE CONTROLS'
                            : 'SHOW MORE CONTROLS'}
                </span>

                <span className={`inline-block text-[10px] transition-transform duration-[250ms] ${controlsVisible ? "rotate-0" : "rotate-180"}`}>
                    ▼
                </span>
            </button>

            {keyboardOn && (
                <input
                    ref={hiddenInputRef}
                    className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
                    onKeyDown={handleKeyDown}
                    onChange={handleInput}
                    onCompositionStart={handleCompositionStart}
                    onCompositionUpdate={handleCompositionUpdate}
                    onCompositionEnd={handleCompositionEnd}
                    autoFocus
                    autoComplete="on"
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            )}
        </div>
    )
}
