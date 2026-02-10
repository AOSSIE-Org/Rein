import { mouse, Point, Button, keyboard } from '@nut-tree-fork/nut-js';
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
    direction?: 'up' | 'down' | 'left' | 'right';
}

export class InputHandler {
    constructor() {
        mouse.config.mouseSpeed = 1200;
    }

    async handleMessage(msg: InputMessage) {
        try {
            switch (msg.type) {
                case 'move': {
                    if (msg.dx != null && msg.dy != null) {
                        const pos = await mouse.getPosition();
                        const s = CONFIG.MOUSE_SENSITIVITY ?? 1;
                        await mouse.setPosition(
                            new Point(pos.x + msg.dx * s, pos.y + msg.dy * s)
                        );
                    }
                    break;
                }

                case 'click': {
                    if (!msg.button) break;
                    const btn =
                        msg.button === 'left'
                            ? Button.LEFT
                            : msg.button === 'right'
                            ? Button.RIGHT
                            : Button.MIDDLE;

                    msg.press
                        ? await mouse.pressButton(btn)
                        : await mouse.releaseButton(btn);
                    break;
                }

                case 'scroll': {
                    const invert = CONFIG.MOUSE_INVERT ? -1 : 1;
                    if (msg.dy) await mouse.scrollDown(msg.dy * invert);
                    if (msg.dx) await mouse.scrollRight(msg.dx * invert);
                    break;
                }

                case 'key': {
                    if (!msg.key) break;
                    const k = KEY_MAP[msg.key.toLowerCase()];
                    await keyboard.type(k ?? msg.key);
                    break;
                }

                case 'text': {
                    if (msg.text) await keyboard.type(msg.text);
                    break;
                }
            }
        } catch (e) {
            console.error('Input Error', e);
        }
    }
}
