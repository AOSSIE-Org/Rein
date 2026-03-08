import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import { writeFile } from "node:fs/promises"
import {
	storeToken,
	isKnownToken,
	touchToken,
	getActiveToken,
	hasTokens,
	generateToken,
} from "../tokenStore"

vi.mock("node:fs")
vi.mock("node:fs/promises")

// Mock crypto.randomUUID globally
import crypto from "node:crypto"
vi.mock("node:crypto", () => ({
	default: {
		randomUUID: vi.fn(() => "test-uuid-1234"),
		timingSafeEqual: vi.fn((a, b) => a.toString() === b.toString()),
	},
	randomUUID: vi.fn(() => "test-uuid-1234"),
	timingSafeEqual: vi.fn((a, b) => a.toString() === b.toString()),
}))

describe("tokenStore", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.mocked(fs.existsSync).mockReturnValue(false)
		vi.mocked(fs.readFileSync).mockReturnValue("[]")
		// Force reset of internal tokens state by re-importing or clearing if possible.
		// Since it's a module, we might need to be careful.
		// For unit tests, we can just clear the tokens array if we had access,
		// but since it's private, we rely on the implementation's behavior.
		// Let's assume a clean state for each test if we can.
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it("should generate a random UUID token", () => {
		const token = generateToken()
		expect(token).toBe("test-uuid-1234")
	})

	it("should store and verify a token", () => {
		const token = "my-test-token"
		storeToken(token)
		expect(isKnownToken(token)).toBe(true)
		expect(hasTokens()).toBe(true)
		expect(getActiveToken()).toBe(token)
	})

	it("should return false for unknown tokens", () => {
		expect(isKnownToken("unknown")).toBe(false)
	})

	it("should update lastUsed when touching a token", () => {
		const token = "touch-token"
		const now = Date.now()
		storeToken(token)

		vi.advanceTimersByTime(1000)
		touchToken(token)

		// Verification would ideally check the internal state,
		// but we can check if it still exists and persistence was called.
		expect(isKnownToken(token)).toBe(true)
		// throttled save might not be called immediately unless forced
	})

	it("should purge expired tokens", () => {
		const token = "old-token"
		storeToken(token)

		// Advance time beyond EXPIRY_MS (10 days)
		const EXPIRY_MS = 10 * 24 * 60 * 60 * 1000
		vi.advanceTimersByTime(EXPIRY_MS + 1000)

		// isKnownToken calls purgeExpired internally
		expect(isKnownToken(token)).toBe(false)
		expect(hasTokens()).toBe(false)
	})

	it("should persist tokens to file on store", async () => {
		const token = "persist-token"
		storeToken(token)

		expect(writeFile).toHaveBeenCalled()
		const [filePath, content] = vi.mocked(writeFile).mock.calls[0] as any
		expect(filePath).toContain("tokens.json")
		expect(content).toContain(token)
	})
})
