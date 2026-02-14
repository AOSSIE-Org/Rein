import { clipboard } from '@nut-tree-fork/nut-js';

interface ClipboardData {
  text: string;
  timestamp: number;
  source: 'computer' | 'phone';
}

export class ClipboardMonitor {
  private lastClipboard: ClipboardData | null = null;
  private isMonitoring: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private onChange?: (data: ClipboardData) => void;
  private TTL_MS = 2 * 60 * 1000; // 2 minutes (like Apple)

  constructor(onChangeCallback: (data: ClipboardData) => void) {
    this.onChange = onChangeCallback;
  }

  async start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('[Clipboard] Monitoring started');

    // Check clipboard every 300ms (faster than before)
    this.intervalId = setInterval(async () => {
      try {
        const currentText = await clipboard.getContent();
        
        // Check if clipboard changed
        const hasChanged = !this.lastClipboard || 
                          currentText !== this.lastClipboard.text;
        
        if (hasChanged && currentText.length > 0) {
          const clipboardData: ClipboardData = {
            text: currentText,
            timestamp: Date.now(),
            source: 'computer'
          };

          // Check if this is from phone (prevent echo)
          if (this.lastClipboard?.source === 'phone' && 
              Date.now() - this.lastClipboard.timestamp < 1000) {
            // This was just set by phone, don't broadcast back
            return;
          }

          this.lastClipboard = clipboardData;
          console.log('[Clipboard] Computer copied:', currentText.substring(0, 50));
          
          if (this.onChange) {
            this.onChange(clipboardData);
          }
        }

        // TTL: Clear expired clipboard
        if (this.lastClipboard && 
            Date.now() - this.lastClipboard.timestamp > this.TTL_MS) {
          console.log('[Clipboard] TTL expired, clearing');
          this.lastClipboard = null;
        }
      } catch (error) {
        // Silently ignore - clipboard might be inaccessible
      }
    }, 300);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.isMonitoring = false;
      console.log('[Clipboard] Monitoring stopped');
    }
  }

  async setClipboard(text: string, source: 'computer' | 'phone' = 'phone'): Promise<boolean> {
    try {
      await clipboard.setContent(text);
      
      this.lastClipboard = {
        text,
        timestamp: Date.now(),
        source
      };
      
      console.log(`[Clipboard] Set from ${source}:`, text.substring(0, 50));
      return true;
    } catch (error) {
      console.error('[Clipboard] Error setting:', error);
      return false;
    }
  }

  // Check if clipboard data is still valid (not expired)
  isValid(): boolean {
    if (!this.lastClipboard) return false;
    return Date.now() - this.lastClipboard.timestamp < this.TTL_MS;
  }

  // Get current clipboard with metadata
  getCurrent(): ClipboardData | null {
    return this.isValid() ? this.lastClipboard : null;
  }
}