import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"

const DAY_MS = 24 * 60 * 60 * 1000
const tempDirs: string[] = []

type TokenStore = typeof import("./tokenStore.ts")

/** Import a fresh module instance so each test gets its own on-disk state. */
async function freshStore(): Promise<TokenStore> {
	const dataDir = mkdtempSync(path.join(os.tmpdir(), "rein-token-store-"))
	tempDirs.push(dataDir)
	process.env.REIN_DATA_DIR = dataDir
	vi.resetModules()
	return import("./tokenStore.ts")
}

describe("tokenStore expiry", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
	})

	afterEach(() => {
		vi.useRealTimers()
		delete process.env.REIN_DATA_DIR
	})

	afterAll(async () => {
		// Let the throttled saves finish writing before removing their directories.
		await new Promise((resolve) => setTimeout(resolve, 100))
		for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
	})

	it("slides the expiry window forward when a token is used", async () => {
		const store = await freshStore()
		store.storeToken("token-a")

		// Day 9: still within the window, and the check counts as activity.
		vi.advanceTimersByTime(9 * DAY_MS)
		expect(store.isKnownToken("token-a")).toBe(true)

		// Day 18: past EXPIRY_MS since creation, but only 9 days since last use.
		vi.advanceTimersByTime(9 * DAY_MS)
		expect(store.isKnownToken("token-a")).toBe(true)
	})

	it("expires a token after EXPIRY_MS of inactivity", async () => {
		const store = await freshStore()
		store.storeToken("token-b")

		vi.advanceTimersByTime(10 * DAY_MS + 1)
		expect(store.isKnownToken("token-b")).toBe(false)
	})

	it("rejects unknown tokens and leaves known ones intact", async () => {
		const store = await freshStore()
		store.storeToken("token-c")

		expect(store.isKnownToken("token-d")).toBe(false)
		expect(store.isKnownToken("token-c")).toBe(true)
	})
})
