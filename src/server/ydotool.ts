import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Maps standard key strings to Linux input-event-codes (required by ydotool >= 1.0.0)
const YDOTOOL_KEY_MAP: Record<string, number> = {
    // Letters
    a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36, k: 37, l: 38, m: 50,
    n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22, v: 47, w: 17, x: 45, y: 21, z: 44,
    // Numbers
    '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
    // Modifiers
    shift: 42, leftshift: 42, rightshift: 54,
    control: 29, ctrl: 29, leftcontrol: 29, rightcontrol: 97, rightctrl: 97,
    alt: 56, leftalt: 56, rightalt: 100,
    meta: 125, super: 125, leftmeta: 125, rightmeta: 126, rightsuper: 126,
    // Navigation & editing
    backspace: 14, enter: 28, return: 28, tab: 15, escape: 1, esc: 1,
    delete: 111, del: 111, insert: 110, ins: 110, home: 102, end: 107,
    pageup: 104, pgup: 104, pagedown: 109, pgdn: 109,
    arrowup: 103, up: 103, arrowdown: 108, down: 108,
    arrowleft: 105, left: 105, arrowright: 106, right: 106,
    // Function keys
    f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
    // Special
    space: 57, capslock: 58, numlock: 69, scrolllock: 70, pause: 119, printscreen: 99, print: 99,
    // Media (approximate common codes)
    audiomute: 113, volumemute: 113, audiovoldown: 114, volumedown: 114, audiovolup: 115, volumeup: 115,
    audioplay: 164, play: 164, audiostop: 166, stop: 166, audioprev: 165, previous: 165, audionext: 163, next: 163
};

export class YdotoolFallback {
    private static available: boolean | null = null;
    private static checkPromise: Promise<boolean> | null = null;

    static async isAvailable(): Promise<boolean> {
        if (this.available !== null) return this.available;
        if (this.checkPromise) return this.checkPromise;

        this.checkPromise = (async () => {
            if (process.platform !== 'linux') {
                this.available = false;
                return false;
            }
            try {
                await execFileAsync('which', ['ydotool']);
                this.available = true;
                console.log('[YdotoolFallback] ydotool detected. Using as temporary fallback for Wayland support.');
            } catch {
                this.available = false;
            }
            return this.available;
        })();

        return this.checkPromise;
    }

        static async move(dx: number, dy: number): Promise<void> {
        const rx = Math.round(dx);
        const ry = Math.round(dy);
    
        if (rx === 0 && ry === 0) return;
    
        try {
            await execFileAsync('ydotool', [
                'mousemove',
                '-x',
                rx.toString(),
                '-y',
                ry.toString(),
            ]);
        } catch (err) {
            console.error(
                '[YdotoolFallback] move error (ensure ydotoold daemon is running for v1.0.0+):',
                err
            );
        }
    }

    static async click(
        button: 'left' | 'right' | 'middle',
        press?: boolean
    ): Promise<void> {
        const buttonMap: Record<typeof button, string> = {
            left: '0x110',
            right: '0x111',
            middle: '0x112',
        };
    
        const btnCode = buttonMap[button];
    
        try {
            if (press === true) {
                // press only
                await execFileAsync('ydotool', [
                    'pointer',
                    'press',
                    '-b',
                    btnCode,
                ]);
            } else if (press === false) {
                // release only
                await execFileAsync('ydotool', [
                    'pointer',
                    'release',
                    '-b',
                    btnCode,
                ]);
            } else {
                // full click fallback
                await execFileAsync('ydotool', [
                    'click',
                    '-b',
                    btnCode,
                ]);
            }
        } catch (err) {
            console.error(
                '[YdotoolFallback] click error (ensure ydotoold daemon is running):',
                err
            );
        }
    }

    static async scroll(dx: number, dy: number): Promise<void> {
        try {
            const promises: Promise<any>[] = [];
            
            // Ydotool handles scrolling via mouse buttons (4, 5, 6, 7)
            let scrollYCode = '';
            if (dy > 0) scrollYCode = '0xC4'; // Scroll down (button 5)
            else if (dy < 0) scrollYCode = '0xC3'; // Scroll up (button 4)

            if (scrollYCode) {
                const count = Math.min(Math.abs(Math.round(dy)), 20); // Cap per event cycle to avoid flooding
                promises.push(execFileAsync('ydotool', ['click', '--repeat', count.toString(), scrollYCode]));
            }

            let scrollXCode = '';
            if (dx > 0) scrollXCode = '0xC5'; // Scroll right (button 6)
            else if (dx < 0) scrollXCode = '0xC6'; // Scroll left (button 7)

            if (scrollXCode) {
                 const count = Math.min(Math.abs(Math.round(dx)), 20);
                 promises.push(execFileAsync('ydotool', ['click', '--repeat', count.toString(), scrollXCode]));
            }

            await Promise.all(promises);
        } catch (err) {
            console.error('[YdotoolFallback] scroll error:', err);
        }
    }

    static async zoom(amount: number): Promise<void> {
        try {
            const ctrlCode = 29; // Left Ctrl
            const scrollCode = amount > 0 ? '0xC4' : '0xC3'; // down : up
            const count = Math.abs(amount).toString();
            
            await execFileAsync('ydotool', ['key', `${ctrlCode}:1`]); // Press Ctrl
            await execFileAsync('ydotool', ['click', '--repeat', count, scrollCode]); // Scroll
            await execFileAsync('ydotool', ['key', `${ctrlCode}:0`]); // Release Ctrl
        } catch (err) {
            console.error('[YdotoolFallback] zoom error:', err);
            await execFileAsync('ydotool', ['key', '29:0']).catch(() => {}); // Failsafe release
        }
    }

    static async key(keyString: string): Promise<void> {
        const code = YDOTOOL_KEY_MAP[keyString.toLowerCase()];
        try {
            if (code !== undefined) {
                await execFileAsync('ydotool', ['key', `${code}:1`, `${code}:0`]);
            } else if (keyString.length === 1) {
                await this.text(keyString);
            }
        } catch (err) {
            console.error('[YdotoolFallback] key error:', err);
        }
    }

    static async combo(keys: string[]): Promise<void> {
        const codes: number[] = [];
        for (const k of keys) {
             const code = YDOTOOL_KEY_MAP[k.toLowerCase()];
             if (code !== undefined) {
                 codes.push(code);
             } else {
                 console.warn(`[YdotoolFallback] Unknown key in combo: ${k}`);
             }
        }

        if (codes.length === 0) return;

        try {
            const args = ['key'];
            for (const code of codes) args.push(`${code}:1`); // Press all
            for (let i = codes.length - 1; i >= 0; i--) {
                args.push(`${codes[i]}:0`); // Release all in reverse
            }
            await execFileAsync('ydotool', args);
        } catch (err) {
            console.error('[YdotoolFallback] combo error:', err);
        }
    }

    static async text(textString: string): Promise<void> {
        if (!textString) return;
        try {
            await execFileAsync('ydotool', ['type', '--', textString]);
        } catch (err) {
            console.error('[YdotoolFallback] text error:', err);
        }
    }
}
