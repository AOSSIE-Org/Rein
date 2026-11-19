import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DAY = 24 * 60 * 60 * 1000

describe("tokenStore", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "rein-tokens-"))
		process.env.REIN_DATA_DIR = dir
		vi.resetModules()
	})

	afterEach(() => {
		vi.useRealTimers()
		Reflect.deleteProperty(process.env, "REIN_DATA_DIR")
		fs.rmSync(dir, { recursive: true, force: true })
	})

	const load = () => import("../../src/server/tokenStore.ts")
	const flush = () => new Promise((r) => setTimeout(r, 50))
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
		await flush()
		expect(readSaved()).toHaveLength(1)
	})

	it("persists tokens and reloads them on startup", async () => {
		const store = await load()
		store.storeToken("persisted-token")
		await flush()
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
		const store = await load()
		store.storeToken("a") // starts a save
		store.storeToken("b") // requested while the first save is still running
		await flush()
		expect(
			readSaved()
				.map((t) => t.token)
				.sort(),
		).toEqual(["a", "b"])
	})
})
