import { mouse, Point, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';
import { CONFIG } from '../config';

export interface InputMessage {
    type: 'move' | 'click' | 'scroll' | 'key' | 'text' | 'swipe';
    dx?: number;
    dy?: number;
    button?: 'left' | 'right' | 'middle';
    press?: boolean;
    key?: string;
    text?: string;
    direction?: 'left' | 'right' | 'up' | 'down';
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

            case 'swipe':
                if (msg.direction) {
                    const isMac = process.platform === 'darwin';
                    const isWindows = process.platform === 'win32';

                    if (msg.direction === 'left') {
                        if (isMac) {
                            await keyboard.pressKey(Key.LeftControl, Key.Right);
                            await keyboard.releaseKey(Key.LeftControl, Key.Right);
                        } else if (isWindows) {
                            await keyboard.pressKey(Key.LeftControl, Key.LeftSuper, Key.Right);
                            await keyboard.releaseKey(Key.LeftControl, Key.LeftSuper, Key.Right);
                        }
                    } else if (msg.direction === 'right') {
                        if (isMac) {
                            await keyboard.pressKey(Key.LeftControl, Key.Left);
                            await keyboard.releaseKey(Key.LeftControl, Key.Left);
                        } else if (isWindows) {
                            await keyboard.pressKey(Key.LeftControl, Key.LeftSuper, Key.Left);
                            await keyboard.releaseKey(Key.LeftControl, Key.LeftSuper, Key.Left);
                        }
                    } else if (msg.direction === 'up') {
                        if (isMac) {
                            await keyboard.pressKey(Key.LeftControl, Key.Up);
                            await keyboard.releaseKey(Key.LeftControl, Key.Up);
                        } else if (isWindows) {
                            await keyboard.pressKey(Key.LeftSuper, Key.Tab);
                            await keyboard.releaseKey(Key.LeftSuper, Key.Tab);
                        }
                    } else if (msg.direction === 'down') {
                        if (isMac) {
                            await keyboard.pressKey(Key.LeftControl, Key.Down);
                            await keyboard.releaseKey(Key.LeftControl, Key.Down);
                        } else if (isWindows) {
                            await keyboard.pressKey(Key.LeftSuper, Key.D);
                            await keyboard.releaseKey(Key.LeftSuper, Key.D);
                        }
                    }
                }
                break;
        }
    }
}
