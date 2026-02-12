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
    // Security Constants (ADDED)
    private static readonly MAX_TEXT_LENGTH = 500;
    private static readonly MAX_DELTA = 2000;
    private static readonly MAX_SCROLL = 500;
    private static readonly MAX_ZOOM_INPUT = 1000;
    private static readonly MAX_COMBO_KEYS = 5;

    constructor() {
        mouse.config.mouseSpeed = 1000;
    }

    // Utility clamp (ADDED)
    private clamp(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(min, Math.min(max, value));
    }

    async handleMessage(msg: InputMessage) {
        switch (msg.type) {

            case 'move':
                if (msg.dx !== undefined && msg.dy !== undefined) {

                    // Clamp dx/dy
                    const safeDx = this.clamp(msg.dx, -InputHandler.MAX_DELTA, InputHandler.MAX_DELTA);
                    const safeDy = this.clamp(msg.dy, -InputHandler.MAX_DELTA, InputHandler.MAX_DELTA);

                    const currentPos = await mouse.getPosition();
                    
                    await mouse.setPosition(new Point(
                        currentPos.x + safeDx, 
                        currentPos.y + safeDy
                    ));
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
                const promises: Promise<void>[] = [];

                //Clamp scroll values
                const safeScrollY = typeof msg.dy === 'number'
                    ? this.clamp(msg.dy, -InputHandler.MAX_SCROLL, InputHandler.MAX_SCROLL)
                    : 0;

                const safeScrollX = typeof msg.dx === 'number'
                    ? this.clamp(msg.dx, -InputHandler.MAX_SCROLL, InputHandler.MAX_SCROLL)
                    : 0;

                // Vertical scroll
                if (safeScrollY !== 0) {
                    if (safeScrollY > 0) {
                        promises.push(mouse.scrollDown(safeScrollY));
                    } else {
                        promises.push(mouse.scrollUp(-safeScrollY));
                    }
                }

                // Horizontal scroll
                if (safeScrollX !== 0) {
                    if (safeScrollX > 0) {
                        promises.push(mouse.scrollRight(safeScrollX));
                    } else {
                        promises.push(mouse.scrollLeft(-safeScrollX));
                    }
                }

                if (promises.length) {
                    await Promise.all(promises);
                }
                break;

            case 'zoom':
                if (msg.delta !== undefined && msg.delta !== 0) {

                    // Clamp incoming zoom delta
                    const safeDelta = this.clamp(
                        msg.delta,
                        -InputHandler.MAX_ZOOM_INPUT,
                        InputHandler.MAX_ZOOM_INPUT
                    );

                    const sensitivityFactor = 0.5; 
                    const MAX_ZOOM_STEP = 5;

                    const scaledDelta =
                        Math.sign(safeDelta) *
                        Math.min(Math.abs(safeDelta) * sensitivityFactor, MAX_ZOOM_STEP);

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
                    const lowerKey = msg.key.toLowerCase();

                    //  Allowlist validation
                    if (!(lowerKey in KEY_MAP) && lowerKey.length !== 1) {
                        console.warn(`Blocked unknown key: ${msg.key}`);
                        return;
                    }

                    const nutKey = KEY_MAP[lowerKey];

                    if (nutKey !== undefined) {
                        await keyboard.type(nutKey);
                    } else if (lowerKey.length === 1) {
                        await keyboard.type(lowerKey);
                    }
                }
                break;

            case 'combo':
                if (msg.keys && msg.keys.length > 0) {

                    // Limit combo length
                    if (msg.keys.length > InputHandler.MAX_COMBO_KEYS) {
                        console.warn('Combo too long — blocked');
                        return;
                    }

                    // Remove duplicate keys
                    const seen = new Set<string>();
                    const uniqueKeys: string[] = [];
                    for (const k of msg.keys) {
                        const lower = k.toLowerCase();
                        if (!seen.has(lower)) {
                            seen.add(lower);
                            uniqueKeys.push(k);  // preserve original for single-char typing
                        }
                    }

                    const nutKeys: (Key | string)[] = [];

                    for (const k of uniqueKeys) {
                        const lowerKey = k.toLowerCase();

                        if (!(lowerKey in KEY_MAP) && lowerKey.length !== 1) {
                            console.warn(`Blocked unknown key in combo: ${k}`);
                            continue;
                        }

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

                    console.log(`Combo complete: ${msg.keys.join('+')}`);
                }
                break;

            case 'text':
                if (msg.text) {

                    // Limit text length
                    if (msg.text.length > InputHandler.MAX_TEXT_LENGTH) {
                        console.warn('Text input too long — blocked');
                        return;
                    }

                    await keyboard.type(msg.text);
                }
                break;
        }
    }
}
