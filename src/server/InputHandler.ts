import { mouse, Point, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';
import { CONFIG } from '../config';

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'zoom';
    dx?: number;
    dy?: number;
    button?: 'left' | 'right' | 'middle';
    press?: boolean;
    key?: string;
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
                    await mouse.setPosition(new Point(currentPos.x + msg.dx, currentPos.y + msg.dy));
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
                const invertMultiplier = (CONFIG.MOUSE_INVERT ?? false) ? -1 : 1;
                if (msg.dy !== undefined && msg.dy !== 0) await mouse.scrollDown(msg.dy * invertMultiplier);
                if (msg.dx !== undefined && msg.dx !== 0) await mouse.scrollRight(msg.dx * -1 * invertMultiplier);
                break;

            case 'zoom':
                if (msg.delta !== undefined && msg.delta !== 0) {
                    const invertMultiplier = (CONFIG.MOUSE_INVERT ?? false) ? -1 : 1;
                    const sensitivityFactor = 0.5; // Adjust scaling
                    const MAX_ZOOM_STEP = 5;
                    const scaledDelta = Math.sign(msg.delta) * Math.min(Math.abs(msg.delta) * sensitivityFactor, MAX_ZOOM_STEP);
                    const amount = -scaledDelta * invertMultiplier;
                    
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

            case 'text':
                if (msg.text) {
                    await keyboard.type(msg.text);
                }
                break;
        }
    }
}