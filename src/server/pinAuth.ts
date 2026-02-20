import crypto from 'crypto';
import { IncomingMessage } from 'http';

const PIN_LENGTH = crypto.randomInt(4, 7); // 4 to 6 digits
const PIN_MAX = 10 ** PIN_LENGTH;
const PIN = crypto.randomInt(0, PIN_MAX).toString().padStart(PIN_LENGTH, '0');

export function getPin(): string {
    return PIN;
}

export function isLocalhost(request: IncomingMessage): boolean {
    const addr = request.socket.remoteAddress;
    if (!addr) return false;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function validatePin(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length !== PIN.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(trimmed), Buffer.from(PIN));
    } catch {
        return false;
    }
}
