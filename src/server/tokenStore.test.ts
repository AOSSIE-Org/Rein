import { mkdtempSync, readFileSync, rmSync } from "node:fs"
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
async function freshStore(): Promise<{ store: TokenStore; dataDir: string }> {
	const dataDir = mkdtempSync(path.join(os.tmpdir(), "rein-token-store-"))
	tempDirs.push(dataDir)
	process.env.REIN_DATA_DIR = dataDir
	vi.resetModules()
	return { store: await import("./tokenStore.ts"), dataDir }
}

/** Poll the persisted store until the token's lastUsed reaches the expected value. */
async function waitForPersistedLastUsed(
	dataDir: string,
	token: string,
	expected: number,
): Promise<boolean> {
	const file = path.join(dataDir, "tokens.json")
	for (let attempt = 0; attempt < 40; attempt++) {
		try {
			const entries = JSON.parse(readFileSync(file, "utf-8")) as {
				token: string
				lastUsed: number
			}[]
			if (entries.some((e) => e.token === token && e.lastUsed === expected)) {
				return true
			}
		} catch {
			// The file may be mid-write; retry.
		}
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
	return false
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
		const { store } = await freshStore()
		store.storeToken("token-a")

		// Day 9: still within the window, and the check counts as activity.
		vi.advanceTimersByTime(9 * DAY_MS)
		expect(store.isKnownToken("token-a")).toBe(true)

		// Day 18: past EXPIRY_MS since creation, but only 9 days since last use.
		vi.advanceTimersByTime(9 * DAY_MS)
		expect(store.isKnownToken("token-a")).toBe(true)
	})

	it("expires a token after EXPIRY_MS of inactivity", async () => {
		const { store } = await freshStore()
		store.storeToken("token-b")

		vi.advanceTimersByTime(10 * DAY_MS + 1)
		expect(store.isKnownToken("token-b")).toBe(false)
	})

	it("rejects unknown tokens and leaves known ones intact", async () => {
		const { store } = await freshStore()
		store.storeToken("token-c")

		expect(store.isKnownToken("token-d")).toBe(false)
		expect(store.isKnownToken("token-c")).toBe(true)
	})

	it("persists a throttled activity update once the window closes", async () => {
		const { store, dataDir } = await freshStore()
		store.storeToken("token-p")

		// Let the forced save from storeToken land so the next update is throttled.
		vi.useRealTimers()
		await new Promise((resolve) => setTimeout(resolve, 100))
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

		// A use inside the throttle window only schedules the write.
		vi.advanceTimersByTime(30 * 1000)
		expect(store.isKnownToken("token-p")).toBe(true)

		// Let the trailing save fire, then let the real file write settle.
		vi.advanceTimersByTime(60 * 1000)
		vi.useRealTimers()

		const expected = Date.parse("2026-01-01T00:00:30.000Z")
		expect(await waitForPersistedLastUsed(dataDir, "token-p", expected)).toBe(
			true,
		)
	})
})
