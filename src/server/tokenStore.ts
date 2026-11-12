import os from "node:os"

import crypto from "node:crypto"
import fs from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

interface TokenEntry {
	token: string
	createdAt: number
	lastUsed: number
}

function resolveDataDir(): string {
	if (process.env.REIN_DATA_DIR) return process.env.REIN_DATA_DIR
	const platform = os.platform()
	if (platform === "win32") {
		return path.join(process.env.APPDATA ?? os.homedir(), "Rein")
	}
	if (platform === "darwin") {
		return path.join(os.homedir(), "Library", "Application Support", "Rein")
	}
	// Linux / other
	return path.join(
		process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
		"Rein",
	)
}

const DATA_DIR = resolveDataDir()
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json")
const EXPIRY_MS = 10 * 24 * 60 * 60 * 1000 // 10 days

let tokens: TokenEntry[] = []
let lastSaveTime = 0
let isSaving = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_THROTTLE_MS = 60 * 1000 // 1 minute

function validateTokens(data: unknown): TokenEntry[] {
	if (!Array.isArray(data)) return []
	return data.filter(
		(t) =>
			typeof t.token === "string" &&
			typeof t.lastUsed === "number" &&
			typeof t.createdAt === "number",
	)
}

function load(): void {
	try {
		if (fs.existsSync(TOKENS_FILE)) {
			const raw = fs.readFileSync(TOKENS_FILE, "utf-8")
			tokens = validateTokens(JSON.parse(raw))
		}
	} catch {
		tokens = []
	}
}

/**
 * Persist a throttled update once the throttle window closes, so activity
 * recorded in memory is not lost if the process keeps running without a
 * forced save.
 */
function scheduleSave(delayMs: number): void {
	if (saveTimer) return
	saveTimer = setTimeout(() => {
		saveTimer = null
		void save(true)
	}, delayMs)
	saveTimer.unref()
}

async function save(force = false): Promise<void> {
	const now = Date.now()
	if (!force && now - lastSaveTime < SAVE_THROTTLE_MS) {
		scheduleSave(SAVE_THROTTLE_MS - (now - lastSaveTime))
		return
	}
	if (isSaving) {
		scheduleSave(SAVE_THROTTLE_MS)
		return
	}

	isSaving = true
	try {
		await mkdir(DATA_DIR, { recursive: true })
		await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), {
			encoding: "utf-8",
			mode: 0o600, // Restricted to owner only
		})
		lastSaveTime = now
		if (saveTimer) {
			clearTimeout(saveTimer)
			saveTimer = null
		}
	} catch (e) {
		console.error("Failed to persist tokens:", e)
	} finally {
		isSaving = false
	}
}

function purgeExpired(): void {
	const now = Date.now()
	const before = tokens.length
	tokens = tokens.filter((t) => now - t.lastUsed < EXPIRY_MS)
	if (tokens.length !== before) save(true)
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	try {
		return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
	} catch {
		return false
	}
}

/**
 * Store a token upon successful connection.
 * If it already exists, refresh its lastUsed timestamp.
 */
export function storeToken(token: string): void {
	purgeExpired()
	const existing = tokens.find((t) => timingSafeEqual(t.token, token))
	if (existing) {
		existing.lastUsed = Date.now()
	} else {
		const now = Date.now()
		tokens.push({ token, createdAt: now, lastUsed: now })
	}
	save(true)
}

/**
 * Check if a token is already known/stored on the server.
 * A successful check counts as activity, so the expiry window slides forward
 * instead of being fixed at creation time.
 */
export function isKnownToken(token: string): boolean {
	purgeExpired()
	const entry = tokens.find((t) => timingSafeEqual(t.token, token))
	if (!entry) return false
	entry.lastUsed = Date.now()
	save() // Throttled internally
	return true
}

/** Refresh the lastUsed timestamp for a token. */
export function touchToken(token: string): void {
	const entry = tokens.find((t) => timingSafeEqual(t.token, token))
	if (entry) {
		entry.lastUsed = Date.now()
		save() // Throttled internally
	}
}

/** Returns the most recently used active token, if any. */
export function getActiveToken(): string | null {
	purgeExpired()
	if (tokens.length === 0) return null
	// Return the one used most recently
	const sorted = [...tokens].sort((a, b) => b.lastUsed - a.lastUsed)
	return sorted[0].token
}

/** Returns the active token, creating and storing a new one if none exists. */
export function getOrCreateActiveToken(): string {
	let token = getActiveToken()
	if (!token) {
		token = generateToken()
		storeToken(token)
	}
	return token
}

/** Check if any tokens exist yet (first-run detection). */
export function hasTokens(): boolean {
	purgeExpired()
	return tokens.length > 0
}

/** Generate a cryptographically random token. */
export function generateToken(): string {
	return crypto.randomUUID()
}

// Load persisted tokens on startup
load()
