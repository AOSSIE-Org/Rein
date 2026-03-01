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
// Cache mouse position to avoid expensive mouse.getPosition() calls on every move.
// This significantly improves smoothness during rapid trackpad movement.
export class InputHandler {
    private cachedPosition: Point | null = null;

  constructor() {
    mouse.config.mouseSpeed = 1000;
}

    async handleMessage(msg: InputMessage) {
        switch (msg.type) {

     case 'move':
    if (
        typeof msg.dx === 'number' &&
        typeof msg.dy === 'number' &&
        Number.isFinite(msg.dx) &&
        Number.isFinite(msg.dy)
    ) {
        if (!this.cachedPosition) {
            this.cachedPosition = await mouse.getPosition();
        }

        let nextX = this.cachedPosition.x + msg.dx;
        let nextY = this.cachedPosition.y + msg.dy;

        nextX = Math.max(0, nextX);
        nextY = Math.max(0, nextY);

        nextX = Math.round(nextX * 10) / 10;
        nextY = Math.round(nextY * 10) / 10;
        const nextPosition = new Point(nextX, nextY);
        await mouse.setPosition(nextPosition);
        this.cachedPosition = nextPosition;
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
                        this.cachedPosition = null;
                    }
                }
                break;

            case 'scroll':
                const promises: Promise<void>[] = [];

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
                    const nutKeys: (Key | string)[] = [];

                    for (const k of msg.keys) {
                        const lowerKey = k.toLowerCase();
                        const nutKey = KEY_MAP[lowerKey];

                        if (nutKey !== undefined) {
                            nutKeys.push(nutKey);
                        } else if (lowerKey.length === 1) {
                            nutKeys.push(lowerKey);
                        }
                    }

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
        }
    }
}