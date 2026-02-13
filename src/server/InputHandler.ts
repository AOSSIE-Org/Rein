import { mouse, Point, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';
import { CONFIG } from '../config';

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
    constructor() {
        mouse.config.mouseSpeed = 1000;
    }

    async handleMessage(msg: InputMessage) {
        switch (msg.type) {
            case 'move':
                if (msg.dx !== undefined && msg.dy !== undefined) {
                    const currentPos = await mouse.getPosition();
                    // Apply sensitivity multiplier (server-side only)
                    const sensitivity = CONFIG.MOUSE_SENSITIVITY ?? 1.0;

                    await mouse.setPosition(new Point(
                        currentPos.x + (msg.dx * sensitivity),
                        currentPos.y + (msg.dy * sensitivity)
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

            case 'scroll': {
                const invertMultiplier = (CONFIG.MOUSE_INVERT ?? false) ? -1 : 1;
                const scrollSensitivity = CONFIG.MOUSE_SENSITIVITY ?? 1.0;
                if (msg.dy !== undefined && msg.dy !== 0) await mouse.scrollDown(Math.round(msg.dy * invertMultiplier * scrollSensitivity));
                if (msg.dx !== undefined && msg.dx !== 0) await mouse.scrollRight(Math.round(msg.dx * -1 * invertMultiplier * scrollSensitivity));
                break;
            }

            case 'zoom': {
                if (msg.delta !== undefined && msg.delta !== 0) {
                    const invertMultiplier = (CONFIG.MOUSE_INVERT ?? false) ? -1 : 1;
                    const zoomSensitivity = CONFIG.MOUSE_SENSITIVITY ?? 1.0;
                    const sensitivityFactor = 0.5; // Adjust scaling
                    const MAX_ZOOM_STEP = 5;
                    const scaledDelta = Math.sign(msg.delta) * Math.min(Math.abs(msg.delta) * sensitivityFactor * zoomSensitivity, MAX_ZOOM_STEP);
                    const amount = Math.round(-scaledDelta * invertMultiplier);
                    if (amount !== 0) {

                        await keyboard.pressKey(Key.LeftControl);
                        try {
                            await mouse.scrollDown(amount);
                        } finally {
                            await keyboard.releaseKey(Key.LeftControl);
                        }
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
                    await keyboard.type(msg.text);
                }
                break;
        }
    }
}
