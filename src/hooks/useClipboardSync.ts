import { useEffect, useRef, useState } from 'react';

interface ClipboardData {
  text: string;
  timestamp: number;
  source: 'computer' | 'phone';
}

export function useClipboardSync(ws: WebSocket | null, enabled: boolean) { // ← ADDED enabled parameter
  const [lastSync, setLastSync] = useState<ClipboardData | null>(null);
  const lastPhoneClipboard = useRef<string>('');
  const isSettingClipboard = useRef(false);
  const wsReadyRef = useRef(false);

  // Track WebSocket connection state
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      wsReadyRef.current = true;
    } else {
      wsReadyRef.current = false;
    }
  }, [ws]);

  // Listen for computer clipboard changes
  useEffect(() => {
    if (!ws || !enabled) return; // ← ADDED enabled check

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'clipboard-sync') {
          const clipboardData: ClipboardData = msg.data;
          
          // Prevent echo: Don't update if this came from phone recently
          if (clipboardData.source === 'phone') {
            console.log('[Phone] Ignoring echo from phone');
            return;
          }

          console.log('[Phone] Syncing from computer:', clipboardData.text.substring(0, 50));
          
          // Update phone clipboard invisibly
          updatePhoneClipboard(clipboardData.text);
          setLastSync(clipboardData);
        }
      } catch (error) {
        console.error('[Phone] Error parsing message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, enabled]); // ← ADDED enabled dependency

  // Handle app visibility changes (when user switches apps)
  useEffect(() => {
    if (!enabled) return; // ← ADDED enabled check

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // User returned to the app
        console.log('[Phone] App resumed, checking clipboard');
        
        // Small delay to ensure WebSocket is reconnected
        setTimeout(async () => {
          await checkAndSyncClipboard();
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [ws, enabled]); // ← ADDED enabled dependency

  // Check clipboard and sync if changed
  const checkAndSyncClipboard = async () => {
    if (!enabled) return; // ← ADDED enabled check

    try {
      if (isSettingClipboard.current) return;

      const currentClipboard = await navigator.clipboard.readText();
      
      // If clipboard changed on phone
      if (currentClipboard !== lastPhoneClipboard.current && currentClipboard.length > 0) {
        lastPhoneClipboard.current = currentClipboard;
        
        // Send to computer
        if (ws && ws.readyState === WebSocket.OPEN) {
          const clipboardData: ClipboardData = {
            text: currentClipboard,
            timestamp: Date.now(),
            source: 'phone'
          };

          ws.send(JSON.stringify({
            type: 'clipboard-sync',
            data: clipboardData
          }));

          console.log('[Phone] Synced to computer:', currentClipboard.substring(0, 50));
          setLastSync(clipboardData);
        }
      }
    } catch (error) {
      // Clipboard access denied
      console.log('[Phone] Clipboard access denied or unavailable');
    }
  };

  // Monitor phone clipboard for changes (more aggressive checking)
  useEffect(() => {
    if (!enabled) return; // ← ADDED enabled check

    const checkPhoneClipboard = setInterval(async () => {
      // Only check if app is visible and connected
      if (document.visibilityState !== 'visible') return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      
      await checkAndSyncClipboard();
    }, 300); // Check every 300ms when visible

    return () => clearInterval(checkPhoneClipboard);
  }, [ws, enabled]); // ← ADDED enabled dependency

  // Update phone clipboard without triggering change detection
  const updatePhoneClipboard = async (text: string) => {
    try {
      isSettingClipboard.current = true;
      await navigator.clipboard.writeText(text);
      lastPhoneClipboard.current = text;
      console.log('[Phone] Clipboard updated invisibly');
      
      // Reset flag after a delay
      setTimeout(() => {
        isSettingClipboard.current = false;
      }, 1000);
    } catch (error) {
      console.error('[Phone] Failed to update clipboard:', error);
      isSettingClipboard.current = false;
    }
  };

  return { lastSync };
}