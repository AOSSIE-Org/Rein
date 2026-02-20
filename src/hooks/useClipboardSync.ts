import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for syncing clipboard between phone and PC over the existing WebSocket.
 *
 * Listens for clipboard-content and clipboard-written responses and exposes
 * simple read/write functions the UI can call.
 */
export const useClipboardSync = (
    send: (msg: any) => void,
    wsRef?: React.RefObject<WebSocket | null>
) => {
    const [pcClipboard, setPcClipboard] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const listenerAttached = useRef(false);

    // Attach a message listener on the WebSocket to catch clipboard responses.
    // We need to do this at the hook level since the main send() function is fire-and-forget.
    useEffect(() => {
        if (!wsRef?.current || listenerAttached.current) return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'clipboard-content') {
                    setPcClipboard(data.text || '');
                    setIsBusy(false);
                }

                if (data.type === 'clipboard-written') {
                    setIsBusy(false);
                }
            } catch {
                // Not JSON or not a clipboard message, ignore
            }
        };

        const ws = wsRef.current;
        ws.addEventListener('message', handleMessage);
        listenerAttached.current = true;

        return () => {
            ws.removeEventListener('message', handleMessage);
            listenerAttached.current = false;
        };
    }, [wsRef?.current]);

    // Ask the server to read the PC clipboard and send it back
    const readFromPC = useCallback(() => {
        setIsBusy(true);
        send({ type: 'clipboard-read' });
    }, [send]);

    // Push text from the phone into the PC's clipboard
    const sendToPC = useCallback((text: string) => {
        if (!text.trim()) return;
        setIsBusy(true);
        send({ type: 'clipboard-write', text });
    }, [send]);

    return { pcClipboard, isBusy, readFromPC, sendToPC };
};
