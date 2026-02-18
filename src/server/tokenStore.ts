import crypto from 'crypto';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

interface TokenEntry {
    token: string;
    createdAt: number;
    lastUsed: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKENS_FILE = path.resolve(__dirname, '../tokens.json');
const EXPIRY_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

let tokens: TokenEntry[] = [];
let lastSaveTime = 0;
let isSaving = false;
const SAVE_THROTTLE_MS = 60 * 1000; // 1 minute

function validateTokens(data: any): TokenEntry[] {
    if (!Array.isArray(data)) return [];
    return data.filter(t =>
        typeof t.token === 'string' &&
        typeof t.lastUsed === 'number' &&
        typeof t.createdAt === 'number'
    );
}

function load(): void {
    try {
        if (fs.existsSync(TOKENS_FILE)) {
            const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
            tokens = validateTokens(JSON.parse(raw));
        }
    } catch {
        tokens = [];
    }
}

async function save(force = false): Promise<void> {
    const now = Date.now();
    if (!force && (now - lastSaveTime) < SAVE_THROTTLE_MS) return;
    if (isSaving) return;

    isSaving = true;
    try {
        await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), {
            encoding: 'utf-8',
            mode: 0o600 // Restricted to owner only
        });
        lastSaveTime = now;
    } catch (e) {
        console.error('Failed to persist tokens:', e);
    } finally {
        isSaving = false;
    }
}

function purgeExpired(): void {
    const now = Date.now();
    const before = tokens.length;
    tokens = tokens.filter(t => (now - t.lastUsed) < EXPIRY_MS);
    if (tokens.length !== before) save(true);
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

/**
 * Store a token upon successful connection.
 * If it already exists, refresh its lastUsed timestamp.
 */
export function storeToken(token: string): void {
    purgeExpired();
    const existing = tokens.find(t => timingSafeEqual(t.token, token));
    if (existing) {
        existing.lastUsed = Date.now();
    } else {
        const now = Date.now();
        tokens.push({ token, createdAt: now, lastUsed: now });
    }
    save(true);
}

/** Check if a token is already known/stored on the server. */
export function isKnownToken(token: string): boolean {
    purgeExpired();
    return tokens.some(t => timingSafeEqual(t.token, token));
}

/** Refresh the lastUsed timestamp for a token. */
export function touchToken(token: string): void {
    const entry = tokens.find(t => timingSafeEqual(t.token, token));
    if (entry) {
        entry.lastUsed = Date.now();
        save(); // Throttled internally
    }
}

/** Returns the most recently used active token, if any. */
export function getActiveToken(): string | null {
    purgeExpired();
    if (tokens.length === 0) return null;
    // Return the one used most recently
    const sorted = [...tokens].sort((a, b) => b.lastUsed - a.lastUsed);
    return sorted[0].token;
}

/** Check if any tokens exist yet (first-run detection). */
export function hasTokens(): boolean {
    purgeExpired();
    return tokens.length > 0;
}

/** Generate a cryptographically random token. */
export function generateToken(): string {
    return crypto.randomUUID();
}

// Load persisted tokens on startup
load();
