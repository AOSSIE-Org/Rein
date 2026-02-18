import { mouse, Point, Button, keyboard, Key, clipboard } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'zoom' | 'combo' | 'clipboard' | 'paste' | 'copy';
    dx?: number;
    dy?: number;
    button?: 'left' | 'right' | 'middle';
    press?: boolean;
    key?: string;
    keys?: string[];
    text?: string;
    delta?: number;
    clipboardAction?: 'copy' | 'paste';
}

const isMac = process.platform === 'darwin';

const translateKey = (key: string): string => {
    if (isMac && key.toLowerCase() === 'control') return 'meta';
    return key;
};

export class InputHandler {
    constructor() {
        mouse.config.mouseSpeed = 1000;
        mouse.config.autoDelayMs = 0;
        keyboard.config.autoDelayMs = 0;
    }

    async handleMessage(msg: InputMessage) {
        switch (msg.type) {
            case 'clipboard':
                try {
                    const modKey = isMac ? Key.LeftSuper : Key.LeftControl;

                    if (msg.clipboardAction === 'copy') {
                        console.log(`[Clipboard] Action: Copy triggered (${isMac ? 'macOS' : 'Windows/Linux'})`);
                        
                        await keyboard.pressKey(modKey, Key.C);
                        await keyboard.releaseKey(modKey, Key.C);

                        try {
                            const content = await clipboard.getContent();
                            console.log(`[Clipboard] Copied content length: ${content.length}`);
                        } catch (logErr) {
                            console.log('[Clipboard] Log Warning: Could not read content for debug log.');
                        }
                    } else if (msg.clipboardAction === 'paste') {
                        console.log(`[Clipboard] Action: Paste triggered (${isMac ? 'macOS' : 'Windows/Linux'})`);
                        
                        await keyboard.pressKey(modKey, Key.V);
                        await keyboard.releaseKey(modKey, Key.V);
                        
                        console.log('[Clipboard] Native Paste command sent.');
                    }
                } catch (err) {
                    console.error('[Clipboard] Error:', err);
                }
                break;

            case 'move':
                if (msg.dx !== undefined && msg.dy !== undefined) {
                    // ========== OPTIMIZED: Use relative move ==========
                    const currentPos = await mouse.getPosition();
                    await mouse.move([
                        new Point(currentPos.x + msg.dx, currentPos.y + msg.dy)
                    ]);
                    // ==================================================
                }
                break;

            case 'click':
                if (msg.button) {
                    const btn = msg.button === 'left' ? Button.LEFT : msg.button === 'right' ? Button.RIGHT : Button.MIDDLE;
                    if (msg.press) {
                        await mouse.pressButton(btn);
                    } else {
                        await mouse.releaseButton(btn);
                    }
                }
                break;

            case 'scroll':
                if (typeof msg.dy === 'number' && msg.dy !== 0) {
                    if (msg.dy > 0) {
                        await mouse.scrollDown(msg.dy);
                    } else {
                        await mouse.scrollUp(-msg.dy);
                    }
                }

                if (typeof msg.dx === 'number' && msg.dx !== 0) {
                    if (msg.dx > 0) {
                        await mouse.scrollRight(msg.dx);
                    } else {
                        await mouse.scrollLeft(-msg.dx);
                    }
                }
                break;

            case 'zoom':
                if (msg.delta !== undefined && msg.delta !== 0) {
                    const sensitivityFactor = 0.5;
                    const MAX_ZOOM_STEP = 5;

                    const scaledDelta =
                        Math.sign(msg.delta) *
                        Math.min(Math.abs(msg.delta) * sensitivityFactor, MAX_ZOOM_STEP);

                    const amount = -scaledDelta;

                    await keyboard.pressKey(Key.LeftControl);
                    try {
                        await mouse.scrollDown(amount);
                    } finally {
                        await keyboard.releaseKey(Key.LeftControl);
                    }
                }
                break;

            case 'key':
                if (msg.key) {
                    const nutKey = KEY_MAP[msg.key.toLowerCase()];
                    if (nutKey !== undefined) {
                        await keyboard.type(nutKey);
                    } else if (msg.key.length === 1) {
                        await keyboard.type(msg.key);
                    }
                }
                break;

            case 'combo':
                if (msg.keys && msg.keys.length > 0) {
                    const translatedKeys = msg.keys.map(translateKey);

                    const nutKeys: (Key | string)[] = [];
                    for (const k of translatedKeys) {
                        const lowerKey = k.toLowerCase();
                        const nutKey = KEY_MAP[lowerKey];
                        if (nutKey !== undefined) {
                            nutKeys.push(nutKey);
                        } else if (lowerKey.length === 1) {
                            nutKeys.push(lowerKey);
                        }
                    }

                    if (nutKeys.length === 0) return;

                    const pressedKeys: Key[] = [];

                    try {
                        for (const k of nutKeys) {
                            if (typeof k === "string") {
                                await keyboard.type(k);
                            } else {
                                await keyboard.pressKey(k);
                                pressedKeys.push(k);
                            }
                        }
                        await new Promise(resolve => setTimeout(resolve, 10));
                    } finally {
                        for (const k of pressedKeys.reverse()) {
                            await keyboard.releaseKey(k);
                        }
                    }
                }
                break;

            case 'text':
                if (msg.text) {
                    await keyboard.type(msg.text);
                }
                break;

            case 'paste':
                try {
                    const isWin = process.platform === 'win32' || process.platform === 'linux';
                    const modifier = isWin ? Key.LeftControl : Key.LeftCmd;
                    
                    await keyboard.pressKey(modifier);
                    try {
                        await keyboard.pressKey(Key.V);
                        await keyboard.releaseKey(Key.V);
                    } finally {
                        await keyboard.releaseKey(modifier);
                    }
                } catch (error) {
                    // Silent
                }
                break;

            case 'copy':
                try {
                    const isWin = process.platform === 'win32' || process.platform === 'linux';
                    const modifier = isWin ? Key.LeftControl : Key.LeftCmd;
                    
                    await keyboard.pressKey(modifier);
                    try {
                        await keyboard.pressKey(Key.C);
                        await keyboard.releaseKey(Key.C);
                    } finally {
                        await keyboard.releaseKey(modifier);
                    }
                } catch (error) {
                    // Silent
                }
                break;
        }
    }
}