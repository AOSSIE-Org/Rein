import crypto from 'crypto';

interface SessionEntry {
    token: string;
    createdAt: number;
    lastUsed: number;
    ip?: string;
}

const EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions: SessionEntry[] = [];

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

function purgeExpired(): void {
    const now = Date.now();
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
        if ((now - sessions[i].lastUsed) > EXPIRY_MS) {
            sessions.splice(i, 1);
        }
    }
}

export function createSession(ip?: string): string {
    purgeExpired();
    const now = Date.now();
    const token = crypto.randomUUID();
    sessions.push({ token, createdAt: now, lastUsed: now, ip });
    return token;
}

export function isValidSession(token: string): boolean {
    purgeExpired();
    return sessions.some((entry) => timingSafeEqual(entry.token, token));
}

export function touchSession(token: string): void {
    const entry = sessions.find((item) => timingSafeEqual(item.token, token));
    if (entry) {
        entry.lastUsed = Date.now();
    }
}
