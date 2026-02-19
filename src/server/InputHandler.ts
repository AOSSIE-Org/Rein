import { mouse, Point, Button, keyboard, Key, clipboard } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';

const isMac = process.platform === 'darwin';

const translateKey = (key: string): string => {
    const k = key.toLowerCase();
    if (isMac && (k === 'control' || k === 'ctrl')) return 'meta';
    return key;
};

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'zoom' | 'combo' | 'paste' | 'clipboard';
    clipboardAction?: 'copy' | 'paste';
    dx?: number; dy?: number; button?: 'left' | 'right' | 'middle';
    press?: boolean; key?: string; keys?: string[]; text?: string; delta?: number;
}

export class InputHandler {
    private lastMoveTime = 0;
    private lastScrollTime = 0;
    private pendingMove: InputMessage | null = null;
    private pendingScroll: InputMessage | null = null;
    private moveTimer: ReturnType<typeof setTimeout> | null = null;
    private scrollTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        mouse.config.mouseSpeed = 1000;
    }

    private async readClipboardText(): Promise<string> {
        try {
            return await clipboard.getContent();
        } catch (error) {
            console.error('Unable to read clipboard text:', error);
            return '';
        }
    }

    private async writeClipboardText(text: string): Promise<void> {
        try {
            await clipboard.setContent(text);
        } catch (error) {
            console.error('Unable to write clipboard text:', error);
        }
    }

    async handleMessage(msg: InputMessage): Promise<string | void> {
        // Validation & Throttling
        if (msg.text && msg.text.length > 500) msg.text = msg.text.substring(0, 500);

        if (msg.type === 'move') {
            const now = Date.now();
            if (now - this.lastMoveTime < 8) {
                this.pendingMove = msg;
                if (!this.moveTimer) {
                    this.moveTimer = setTimeout(() => {
                        this.moveTimer = null;
                        if (this.pendingMove) {
                            const p = this.pendingMove; this.pendingMove = null;
                            this.handleMessage(p).catch(() => {});
                        }
                    }, 8);
                }
                return;
            }
            this.lastMoveTime = now;
        }

        switch (msg.type) {
            case 'move':
                if (typeof msg.dx === 'number' && typeof msg.dy === 'number') {
                    const currentPos = await mouse.getPosition();
                    await mouse.setPosition(new Point(Math.round(currentPos.x + msg.dx), Math.round(currentPos.y + msg.dy)));
                }
                break;
            case 'click':
                if (msg.button) {
                    const btn = msg.button === 'left' ? Button.LEFT : msg.button === 'right' ? Button.RIGHT : Button.MIDDLE;
                    if (msg.press) await mouse.pressButton(btn);
                    else await mouse.releaseButton(btn);
                }
                break;
            case 'scroll':
                if (typeof msg.dy === 'number' && Math.round(msg.dy) !== 0) {
                    const amount = Math.round(msg.dy);
                    if (amount > 0) await mouse.scrollDown(amount);
                    else await mouse.scrollUp(-amount);
                }
                break;
            case 'zoom':
                if (msg.delta !== undefined && msg.delta !== 0) {
                    const amount = Math.round(-Math.sign(msg.delta) * Math.min(Math.abs(msg.delta) * 0.5, 5));
                    if (amount !== 0) {
                        await keyboard.pressKey(Key.LeftControl);
                        try {
                            if (amount > 0) await mouse.scrollDown(amount);
                            else await mouse.scrollUp(-amount);
                        } finally { await keyboard.releaseKey(Key.LeftControl); }
                    }
                }
                break;
            case 'key':
                if (msg.key) {
                    const translated = translateKey(msg.key);
                    const nutKey = KEY_MAP[translated.toLowerCase()];
                    if (nutKey !== undefined) await keyboard.type(nutKey);
                    else if (msg.key.length === 1) await keyboard.type(msg.key);
                }
                break;
            case 'combo':
                if (msg.keys && msg.keys.length > 0) {
                    const nutKeys = msg.keys.map(k => {
                        const t = translateKey(k).toLowerCase();
                        return KEY_MAP[t] || t;
                    });
                    const pressed: any[] = [];
                    try {
                        for (const k of nutKeys) {
                            if (typeof k !== 'string') { await keyboard.pressKey(k); pressed.push(k); }
                            else await keyboard.type(k);
                        }
                        await new Promise(r => setTimeout(r, 10));
                    } finally { for (const k of pressed.reverse()) await keyboard.releaseKey(k); }
                }
                break;
            case 'text':
            case 'paste':
                if (msg.text) await keyboard.type(msg.text);
                else {
                    const mod = isMac ? Key.LeftSuper : Key.LeftControl;
                    await keyboard.pressKey(mod, Key.V);
                    await keyboard.releaseKey(mod, Key.V);
                }
                break;
            case 'clipboard':
                const mod = isMac ? Key.LeftSuper : Key.LeftControl;
                if (msg.clipboardAction === 'copy') {
                    const before = await this.readClipboardText();
                    try { await keyboard.pressKey(mod, Key.C); }
                    finally { await keyboard.releaseKey(mod, Key.C); }
                    for (let i = 0; i < 10; i++) {
                        await new Promise(r => setTimeout(r, 50));
                        const current = await this.readClipboardText();
                        if (current !== before) return current;
                    }
                    return before;
                } else if (msg.clipboardAction === 'paste') {
                    const textToPaste = msg.text || await this.readClipboardText();
                    if (!textToPaste) return;
                    await this.writeClipboardText(textToPaste);
                    try { await keyboard.pressKey(mod, Key.V); }
                    finally { await keyboard.releaseKey(mod, Key.V); }
                }
                break;
        }
    }
}