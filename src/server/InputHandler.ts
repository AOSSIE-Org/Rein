import { mouse, Point, Button, keyboard, Key } from '@nut-tree-fork/nut-js';
import { KEY_MAP } from './KeyMap';
import { logger } from './logger';

// Interface for input messages received from the client.
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

// Handler class for processing OS-level input events.
export class InputHandler {
    constructor() {
        mouse.config.mouseSpeed = 1000;
    }

    // Processes a message and executes the corresponding input action.
    async handleMessage(msg: InputMessage) {
        try {
            switch (msg.type) {
                case 'move':
                    if (msg.dx !== undefined && msg.dy !== undefined) {
                        const currentPos = await mouse.getPosition();

                        await mouse.setPosition(new Point(
                            currentPos.x + msg.dx,
                            currentPos.y + msg.dy
                        ));
                    }
                    break;

                case 'click':
                    if (msg.button) {
                        const btn = msg.button === 'left' ? Button.LEFT : msg.button === 'right' ? Button.RIGHT : Button.MIDDLE;
                        if (msg.press) {
                            logger.debug(`Mouse press: ${msg.button}`);
                            await mouse.pressButton(btn);
                        } else {
                            logger.debug(`Mouse release: ${msg.button}`);
                            await mouse.releaseButton(btn);
                        }
                    }
                    break;

                case 'scroll':
                    const promises: Promise<any>[] = [];

                    if (typeof msg.dy === 'number' && msg.dy !== 0) {
                        if (msg.dy > 0) {
                            promises.push(mouse.scrollDown(msg.dy));
                        } else {
                            promises.push(mouse.scrollUp(-msg.dy));
                        }
                    }

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
                            Math.min(Math.abs(msg.delta) * sensitivityFactor, MAX_ZOOM_STEP);

                        const amount = -scaledDelta;

                        logger.debug(`Zoom: delta=${msg.delta} scaled=${scaledDelta}`);

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
                        logger.debug(`Processing key: ${msg.key}`);
                        const nutKey = KEY_MAP[msg.key.toLowerCase()];
                        if (nutKey !== undefined) {
                            await keyboard.type(nutKey);
                        } else if (msg.key.length === 1) {
                            await keyboard.type(msg.key);
                        } else {
                            logger.warn(`Unmapped key: ${msg.key}`);
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
                                logger.warn(`Unknown key in combo: ${k}`);
                            }
                        }

                        if (nutKeys.length === 0) {
                            logger.error('No valid keys in combo');
                            return;
                        }

                        logger.debug(`Pressing combo: ${msg.keys.join('+')}`);
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

                            await new Promise(resolve => setTimeout(resolve, 10));
                        } finally {
                            for (const k of pressedKeys.reverse()) {
                                await keyboard.releaseKey(k);
                            }
                        }

                        logger.debug(`Combo complete: ${msg.keys.join('+')}`);
                    }
                    break;

                case 'text':
                    if (msg.text) {
                        logger.debug(`Typing text (${msg.text.length} chars)`);
                        await keyboard.type(msg.text);
                    }
                    break;
            }
        } catch (err) {
            logger.error(`InputHandler error [${msg.type}]:`, err);
            throw err;
        }
    }
}