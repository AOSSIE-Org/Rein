import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DAY = 24 * 60 * 60 * 1000

// Wraps the fs calls tokenStore uses so tests can observe every save, wait for
// them to finish, and hold a write open to create a deterministic race window.
const fsState = vi.hoisted(() => ({
	active: 0,
	snapshots: [] as string[],
	gate: null as Promise<void> | null,
}))

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>()
	return {
		...actual,
		mkdir: (...args: Parameters<typeof actual.mkdir>) => {
			fsState.active++
			return actual.mkdir(...args).catch((e) => {
				fsState.active--
				throw e
			})
		},
		writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
			fsState.snapshots.push(String(args[1]))
			try {
				await actual.writeFile(...args)
				const gate = fsState.gate
				fsState.gate = null
				if (gate) await gate
			} finally {
				fsState.active--
			}
		},
	}
})

describe("tokenStore", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "rein-tokens-"))
		process.env.REIN_DATA_DIR = dir
		fsState.active = 0
		fsState.snapshots = []
		fsState.gate = null
		vi.resetModules()
	})

	afterEach(async () => {
		// Let every in-flight save and queued follow-up finish before cleanup.
		await settled()
		vi.useRealTimers()
		Reflect.deleteProperty(process.env, "REIN_DATA_DIR")
		fs.rmSync(dir, { recursive: true, force: true })
	})

	const load = () => import("../../src/server/tokenStore.ts")
	const settled = () => vi.waitFor(() => expect(fsState.active).toBe(0))
	const readSaved = () =>
		JSON.parse(fs.readFileSync(path.join(dir, "tokens.json"), "utf-8")) as {
			token: string
		}[]

	it("starts empty and creates a token on demand", async () => {
		const store = await load()
		expect(store.hasTokens()).toBe(false)
		expect(store.getActiveToken()).toBeNull()
		const token = store.getOrCreateActiveToken()
		expect(store.isKnownToken(token)).toBe(true)
		expect(store.getOrCreateActiveToken()).toBe(token)
	})

	it("rejects unknown tokens, including different-length ones", async () => {
		const store = await load()
		const token = store.generateToken()
		store.storeToken(token)
		expect(store.isKnownToken(token)).toBe(true)
		expect(store.isKnownToken(`${token.slice(0, -1)}x`)).toBe(false)
		expect(store.isKnownToken("short")).toBe(false)
		expect(store.isKnownToken("")).toBe(false)
	})

	it("does not duplicate a token that is stored twice", async () => {
		const store = await load()
		store.storeToken("same-token")
		store.storeToken("same-token")
		await settled()
		expect(readSaved()).toHaveLength(1)
	})

	it("persists tokens and reloads them on startup", async () => {
		const store = await load()
		store.storeToken("persisted-token")
		await settled()
		vi.resetModules()
		const reloaded = await load()
		expect(reloaded.isKnownToken("persisted-token")).toBe(true)
	})

	it("ignores a corrupt or malformed tokens file", async () => {
		fs.writeFileSync(path.join(dir, "tokens.json"), "{not json")
		expect((await load()).hasTokens()).toBe(false)

		vi.resetModules()
		fs.writeFileSync(
			path.join(dir, "tokens.json"),
			JSON.stringify([
				{ token: 1 },
				{ token: "ok", createdAt: Date.now(), lastUsed: Date.now() },
			]),
		)
		const store = await load()
		expect(store.isKnownToken("ok")).toBe(true)
		expect(store.getActiveToken()).toBe("ok") // the malformed entry was dropped
	})

	it("expires tokens 10 days after last use", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
		const store = await load()
		store.storeToken("old")
		vi.setSystemTime(Date.now() + 10 * DAY + 1)
		expect(store.isKnownToken("old")).toBe(false)
	})

	it("touchToken keeps a token alive past its creation expiry", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
		const store = await load()
		store.storeToken("active")
		vi.setSystemTime(Date.now() + 9 * DAY)
		store.touchToken("active")
		vi.setSystemTime(Date.now() + 9 * DAY)
		expect(store.isKnownToken("active")).toBe(true)
	})

	it("getActiveToken returns the most recently used token", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
		const store = await load()
		store.storeToken("first")
		vi.setSystemTime(Date.now() + 1000)
		store.storeToken("second")
		vi.setSystemTime(Date.now() + 1000)
		store.touchToken("first")
		expect(store.getActiveToken()).toBe("first")
	})

	it("does not lose a forced save requested while another is in flight", async () => {
		let release: () => void = () => {}
		fsState.gate = new Promise<void>((r) => {
			release = r
		})
		const store = await load()
		store.storeToken("a")
		// The first write has captured a snapshot with only "a" and is held open.
		await vi.waitFor(() => expect(fsState.snapshots).toHaveLength(1))
		store.storeToken("b") // requested while the first save is in flight
		release()
		await vi.waitFor(() => expect(fsState.snapshots).toHaveLength(2))

		const tokens = (raw: string) =>
			(JSON.parse(raw) as { token: string }[]).map((t) => t.token)
		expect(tokens(fsState.snapshots[0])).toEqual(["a"])
		expect(tokens(fsState.snapshots[1])).toEqual(["a", "b"])
	})
})
