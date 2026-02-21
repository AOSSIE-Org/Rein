import { mouse, Point, Button, keyboard, Key, screen } from '@nut-tree-fork/nut-js';
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

// Maximum allowed values for coordinates and deltas
const MAX_COORDINATE_DELTA = 10000;
const MAX_SCROLL_DELTA = 1000;
const MAX_ZOOM_DELTA = 100;

/**
 * Validates that a value is a finite number
 */
function isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

/**
 * Safely extracts and clamps a numeric value
 */
function safeNumber(value: unknown, maxAbs: number, defaultValue = 0): number {
    if (!isValidNumber(value)) {
        return defaultValue;
    }
    return Math.max(-maxAbs, Math.min(maxAbs, value));
}

/**
 * Validates coordinate message has required fields
 */
function validateCoordinateMessage(msg: InputMessage): { valid: boolean; dx: number; dy: number } {
    const dx = safeNumber(msg.dx, MAX_COORDINATE_DELTA);
    const dy = safeNumber(msg.dy, MAX_COORDINATE_DELTA);
    const valid = isValidNumber(msg.dx) && isValidNumber(msg.dy);
    return { valid, dx, dy };
}

export class InputHandler {
    private screenWidth = 1920;
    private screenHeight = 1080;

    constructor() {
        mouse.config.mouseSpeed = 1000;
        this.updateScreenDimensions();
    }

    private async updateScreenDimensions() {
        try {
            this.screenWidth = await screen.width();
            this.screenHeight = await screen.height();
        } catch (err) {
            console.warn('Failed to get screen dimensions, using defaults:', err);
        }
    }

    /**
     * Clamps a position to screen boundaries
     */
    private clampToScreen(x: number, y: number): Point {
        return new Point(
            Math.max(0, Math.min(this.screenWidth - 1, Math.round(x))),
            Math.max(0, Math.min(this.screenHeight - 1, Math.round(y)))
        );
    }

    async handleMessage(msg: InputMessage) {
        // Validate message type exists
        if (!msg || typeof msg.type !== 'string') {
            console.warn('Invalid message: missing or invalid type');
            return;
        }

        try {
            switch (msg.type) {
                case 'move':
                    await this.handleMove(msg);
                    break;

                case 'click':
                    await this.handleClick(msg);
                    break;

                case 'scroll':
                    await this.handleScroll(msg);
                    break;

                case 'zoom':
                    await this.handleZoom(msg);
                    break;

                case 'key':
                    await this.handleKey(msg);
                    break;

                case 'combo':
                    await this.handleCombo(msg);
                    break;

                case 'text':
                    await this.handleText(msg);
                    break;

                default:
                    console.warn(`Unknown message type: ${(msg as InputMessage).type}`);
            }
        } catch (err) {
            console.error(`Error handling ${msg.type} message:`, err);
            // Don't rethrow - we want the server to continue running
        }
    }

    private async handleMove(msg: InputMessage) {
        const { valid, dx, dy } = validateCoordinateMessage(msg);
        if (!valid) {
            console.warn('Invalid move coordinates, rejecting message');
            return;
        }

       let currentPos;

try {
    currentPos = await mouse.getPosition();
} catch (err) {
    console.error("Failed to get mouse position:", err);
    return;
}

const newPos = this.clampToScreen(currentPos.x + dx, currentPos.y + dy);

try {
    await mouse.setPosition(newPos);
} catch (err) {
    console.error("Mouse setPosition failed:", err);
}
    }

    private async handleClick(msg: InputMessage) {
        const validButtons = ['left', 'right', 'middle'];
        if (!msg.button || !validButtons.includes(msg.button)) {
            console.warn('Invalid click: missing or invalid button');
            return;
        }

        const btn = msg.button === 'left' ? Button.LEFT : msg.button === 'right' ? Button.RIGHT : Button.MIDDLE;
        if (msg.press) {
            await mouse.pressButton(btn);
        } else {
            await mouse.releaseButton(btn);
        }
    }

    private async handleScroll(msg: InputMessage) {
        if (
    (msg.dy !== undefined && !isValidNumber(msg.dy)) ||
    (msg.dx !== undefined && !isValidNumber(msg.dx))
) {
    console.warn('Invalid scroll payload, rejecting');
    return;
}
        const promises: Promise<unknown>[] = [];

        // Validate and clamp scroll values
        const dy = safeNumber(msg.dy, MAX_SCROLL_DELTA);
        const dx = safeNumber(msg.dx, MAX_SCROLL_DELTA);

        // Vertical scroll
        if (dy !== 0) {
            if (dy > 0) {
                promises.push(mouse.scrollDown(dy));
            } else {
                promises.push(mouse.scrollUp(-dy));
            }
        }

        // Horizontal scroll
        if (dx !== 0) {
            if (dx > 0) {
                promises.push(mouse.scrollRight(dx));
            } else {
                promises.push(mouse.scrollLeft(-dx));
            }
        }

        if (promises.length) {
            await Promise.all(promises);
        }
    }

    private async handleZoom(msg: InputMessage) {
    if (!isValidNumber(msg.delta)) {
        console.warn('Invalid zoom: delta is not a valid number');
        return;
    }

    const clampedDelta = safeNumber(msg.delta, MAX_ZOOM_DELTA);
    if (clampedDelta === 0) return;

    const sensitivityFactor = 0.5;
    const MAX_ZOOM_STEP = 5;

    const scaled =
        Math.sign(clampedDelta) *
        Math.min(Math.abs(clampedDelta) * sensitivityFactor, MAX_ZOOM_STEP);

    await keyboard.pressKey(Key.LeftControl);
    try {
        if (scaled > 0) {
            await mouse.scrollUp(scaled);
        } else {
            await mouse.scrollDown(-scaled);
        }
    } finally {
        await keyboard.releaseKey(Key.LeftControl);
    }
}
private async handleKey(msg: InputMessage) {
    if (!msg.key || typeof msg.key !== 'string') {
        console.warn('Invalid key message: missing or invalid key');
        return;
    }

    // Limit key length to prevent DoS
    if (msg.key.length > 50) {
        console.warn('Key string too long, rejecting');
        return;
    }

    console.log(`Processing key: ${msg.key}`);
    const nutKey = KEY_MAP[msg.key.toLowerCase()];

    try {
        if (nutKey !== undefined) {
            await keyboard.type(nutKey);
        } else if (msg.key.length === 1) {
            await keyboard.type(msg.key);
        } else {
            console.log(`Unmapped key: ${msg.key}`);
        }
    } catch (err) {
        console.error('Keyboard input failed:', err);
    }
}
    private async handleCombo(msg: InputMessage) {
        if (!msg.keys || !Array.isArray(msg.keys) || msg.keys.length === 0) {
            console.warn('Invalid combo: missing or empty keys array');
            return;
        }

        // Limit combo size to prevent DoS
        if (msg.keys.length > 10) {
            console.warn('Combo has too many keys, rejecting');
            return;
        }

        const nutKeys: (Key | string)[] = [];
        for (const k of msg.keys) {
            if (typeof k !== 'string') {
                console.warn('Invalid key in combo: not a string');
                continue;
            }
            if (k.length > 50) {
                console.warn('Key in combo too long, skipping');
                continue;
            }

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

    private async handleText(msg: InputMessage) {
        if (!msg.text || typeof msg.text !== 'string') {
            console.warn('Invalid text message: missing or invalid text');
            return;
        }

        // Limit text length to prevent DoS
        if (msg.text.length > 10000) {
            console.warn('Text too long, rejecting');
            return;
        }

        await keyboard.type(msg.text);
    }
}
