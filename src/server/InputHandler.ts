import { mouse, Point, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'zoom' | 'combo';
    dx?: number;
    dy?: number;
    button?: 'left' | 'right' | 'middle';
    press?: boolean;
    key?: string;
    keys?: string[];
    text?: string;
    delta?: number;
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

    async handleMessage(msg: InputMessage) {
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

        // Throttling: Limit high-frequency events to ~60fps (16ms)
        if (msg.type === 'move') {
            const now = Date.now();
            if (now - this.lastMoveTime < 16) {
                this.pendingMove = msg;
                if (!this.moveTimer) {
                    this.moveTimer = setTimeout(() => {
                        this.moveTimer = null;
                        if (this.pendingMove) {
                            const pending = this.pendingMove;
                            this.pendingMove = null;
                            this.handleMessage(pending);
                        }
                    }, 16);
                }
                return;
            }
            this.lastMoveTime = now;
        } else if (msg.type === 'scroll') {
            const now = Date.now();
            if (now - this.lastScrollTime < 16) {
                this.pendingScroll = msg;
                if (!this.scrollTimer) {
                    this.scrollTimer = setTimeout(() => {
                        this.scrollTimer = null;
                        if (this.pendingScroll) {
                            const pending = this.pendingScroll;
                            this.pendingScroll = null;
                            this.handleMessage(pending);
                        }
                    }, 16);
                }
                return;
            }
            this.lastScrollTime = now;
        }

        switch (msg.type) {
            case 'move':
                if (msg.dx !== undefined && msg.dy !== undefined) {
                    const currentPos = await mouse.getPosition();
                    await mouse.setPosition(
                        new Point(currentPos.x + msg.dx, currentPos.y + msg.dy)
                    );
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

            case 'scroll':
                const promises: Promise<void>[] = [];

                // Vertical scroll
                if (typeof msg.dy === 'number' && msg.dy !== 0) {
                    if (msg.dy > 0) {
                        promises.push(mouse.scrollDown(msg.dy));
                    } else {
                        promises.push(mouse.scrollUp(-msg.dy));
                    }
                }

                // Horizontal scroll
                if (typeof msg.dx === 'number' && msg.dx !== 0) {
                    if (msg.dx > 0) {
                        promises.push(mouse.scrollRight(msg.dx));
                    } else {
                        promises.push(mouse.scrollLeft(-msg.dx));
                    }
                }

                if (promises.length) {
                    await Promise.all(promises);
                }
                break;

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

            case 'text':
                if (msg.text) {
                    await keyboard.type(msg.text);
                }
                break;
        }
    }
}
