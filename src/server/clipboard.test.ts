import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getSystemClipboard, setSystemClipboard } from "./clipboard.ts"

describe("Clipboard helper", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should export getSystemClipboard and setSystemClipboard functions", () => {
		expect(typeof getSystemClipboard).toBe("function")
		expect(typeof setSystemClipboard).toBe("function")
	})

	it("getSystemClipboard should return a string without throwing", async () => {
		const result = await getSystemClipboard()
		expect(typeof result).toBe("string")
	})

	it("setSystemClipboard should complete without throwing", async () => {
		await expect(
			setSystemClipboard("Hello Rein Clipboard"),
		).resolves.not.toThrow()
	})
})
