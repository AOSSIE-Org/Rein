import { mouse, Point, Button, keyboard, Key, clipboard } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'zoom' | 'combo' | 'clipboard';
    dx?: number;
    dy?: number;
    button?: 'left' | 'right' | 'middle';
    press?: boolean;
    key?: string;
    keys?: string[];
    text?: string;
    delta?: number;
    action?: 'copy' | 'paste';
}

export class InputHandler {
    private lastMoveTime = 0;
    private lastScrollTime = 0;
    private pendingMove: InputMessage | null = null;
    private pendingScroll: InputMessage | null = null;
    private moveTimer: ReturnType<typeof setTimeout> | null = null;
    private scrollTimer: ReturnType<typeof setTimeout> | null = null;

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

    private async triggerCopyShortcut(): Promise<void> {
        const modifier = process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl;
        try {
            await keyboard.pressKey(modifier, Key.C);
        } finally {
            await keyboard.releaseKey(modifier, Key.C);
        }
    }

    constructor() {
        mouse.config.mouseSpeed = 1000;
    }

    async handleMessage(msg: InputMessage): Promise<string | void> {
        // Validation: Text length sanitation
        if (msg.text && msg.text.length > 500) {
            msg.text = msg.text.substring(0, 500);
        }

        // Validation: Sane bounds for coordinates
        const MAX_COORD = 2000;
        if (typeof msg.dx === 'number' && Number.isFinite(msg.dx)) {
            msg.dx = Math.max(-MAX_COORD, Math.min(MAX_COORD, msg.dx));
        }
        if (typeof msg.dy === 'number' && Number.isFinite(msg.dy)) {
            msg.dy = Math.max(-MAX_COORD, Math.min(MAX_COORD, msg.dy));
        }

        // Throttling: Limit high-frequency events to ~125fps (8ms)
        if (msg.type === 'move') {
            const now = Date.now();
            if (now - this.lastMoveTime < 8) {
                this.pendingMove = msg;
                if (!this.moveTimer) {
                    this.moveTimer = setTimeout(() => {
                        this.moveTimer = null;
                        if (this.pendingMove) {
                            const pending = this.pendingMove;
                            this.pendingMove = null;
                            this.handleMessage(pending).catch((err) => {
                                 console.error('Error processing pending move event:', err);
                             });
                        }
                    }, 8);
                }
                return;
            }
            this.lastMoveTime = now;
        } else if (msg.type === 'scroll') {
            const now = Date.now();
            if (now - this.lastScrollTime < 8) {
                this.pendingScroll = msg;
                if (!this.scrollTimer) {
                    this.scrollTimer = setTimeout(() => {
                        this.scrollTimer = null;
                        if (this.pendingScroll) {
                            const pending = this.pendingScroll;
                            this.pendingScroll = null;
                            this.handleMessage(pending).catch((err) => {
                                 console.error('Error processing pending move event:', err);
                             });
                        }
                    }, 8);
                }
                return;
            }
            this.lastScrollTime = now;
        }

        switch (msg.type) {
            case 'move':
                if (
                    typeof msg.dx === 'number' &&
                    typeof msg.dy === 'number' &&
                    Number.isFinite(msg.dx) &&
                    Number.isFinite(msg.dy)
                ) {
                    const currentPos = await mouse.getPosition();

                    await mouse.setPosition(new Point(
                        Math.round(currentPos.x + msg.dx),
                        Math.round(currentPos.y + msg.dy)
                    ));
                }
                break;

            case 'click':
                if (msg.button) {
                    const btn =
                        msg.button === 'left'
                            ? Button.LEFT
                            : msg.button === 'right'
                            ? Button.RIGHT
                            : Button.MIDDLE;

                    if (msg.press) {
                        await mouse.pressButton(btn);
                    } else {
                        await mouse.releaseButton(btn);
                    }
                }
                break;

            case 'scroll': {
                const promises: Promise<void>[] = [];

                // Vertical scroll
                if (typeof msg.dy === 'number' && Math.round(msg.dy) !== 0) {
                    const amount = Math.round(msg.dy);
                    if (amount > 0) {
                        promises.push(mouse.scrollDown(amount).then(() => { }));
                    } else {
                        promises.push(mouse.scrollUp(-amount).then(() => { }));
                    }
                }

                // Horizontal scroll
                if (typeof msg.dx === 'number' && Math.round(msg.dx) !== 0) {
                    const amount = Math.round(msg.dx);
                    if (amount > 0) {
                        promises.push(mouse.scrollRight(amount).then(() => { }));
                    } else {
                        promises.push(mouse.scrollLeft(-amount).then(() => { }));
                    }
                }

                if (promises.length) {
                    await Promise.all(promises);
                }
                break;
            }

            case 'zoom':
                if (msg.delta !== undefined && msg.delta !== 0) {
                    const sensitivityFactor = 0.5;
                    const MAX_ZOOM_STEP = 5;

                    const scaledDelta =
                        Math.sign(msg.delta) *
                        Math.min(
                            Math.abs(msg.delta) * sensitivityFactor,
                            MAX_ZOOM_STEP
                        );

                    const amount = Math.round(-scaledDelta);

                    if (amount !== 0) {
                        await keyboard.pressKey(Key.LeftControl);
                        try {
                            if (amount > 0) {
                                await mouse.scrollDown(amount);
                            } else {
                                await mouse.scrollUp(-amount);
                            }
                        } finally {
                            await keyboard.releaseKey(Key.LeftControl);
                        }
                    }
                }
                break;

            case 'key':
                if (msg.key) {
                    console.log(`Processing key: ${msg.key}`);
                    const nutKey = KEY_MAP[msg.key.toLowerCase()];

                    if (nutKey !== undefined) {
                        await keyboard.type(nutKey);
                    } else if (msg.key.length === 1) {
                        await keyboard.type(msg.key);
                    } else {
                        console.log(`Unmapped key: ${msg.key}`);
                    }
                }
                break;

            case 'combo':
                if (msg.keys && msg.keys.length > 0) {
                    const nutKeys: (Key | string)[] = [];

                    for (const k of msg.keys) {
                        const lowerKey = k.toLowerCase();
                        const nutKey = KEY_MAP[lowerKey];

                        if (nutKey !== undefined) {
                            nutKeys.push(nutKey);
                        } else if (lowerKey.length === 1) {
                            nutKeys.push(lowerKey);
                        } else {
                            console.warn(`Unknown key in combo: ${k}`);
                        }
                    }

                    if (nutKeys.length === 0) {
                        console.error('No valid keys in combo');
                        return;
                    }

                    console.log(`Pressing keys:`, nutKeys);
                    const pressedKeys: Key[] = [];

                    try {
                        for (const k of nutKeys) {
                            if (typeof k === 'string') {
                                await keyboard.type(k);
                            } else {
                                await keyboard.pressKey(k);
                                pressedKeys.push(k);
                            }
                        }

                        await new Promise(resolve =>
                            setTimeout(resolve, 10)
                        );
                    } finally {
                        for (const k of pressedKeys.reverse()) {
                            await keyboard.releaseKey(k);
                        }
                    }

                    console.log(`Combo complete: ${msg.keys.join('+')}`);
                }
                break;

            case 'clipboard': {
                if (msg.action === 'copy') {
                    const before = await this.readClipboardText();
                    try {
                        await this.triggerCopyShortcut();
                    } catch (error) {
                        console.error('Unable to trigger system copy shortcut:', error);
                    }

                    for (let i = 0; i < 10; i++) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        const current = await this.readClipboardText();
                        if (current !== before) {
                            return current;
                        }
                    }

                    return before;
                } else if (msg.action === 'paste') {
                    const textToPaste = typeof msg.text === 'string' ? msg.text : await this.readClipboardText();
                    if (!textToPaste) {
                        return;
                    }

                    await this.writeClipboardText(textToPaste);
                    await keyboard.type(textToPaste);
                }
                break;
            }

            case 'text':
                if (msg.text) {
                    await keyboard.type(msg.text);
                }
                break;
        }
    }
}
