import { afterEach, describe, expect, it, vi } from "vitest"
import {
	getStoredBoolean,
	getStoredNumber,
	safeGetItem,
	safeSetItem,
} from "./storage"

describe("storage utils", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("returns null when localStorage access throws on read", () => {
		vi.stubGlobal(
			"window",
			{
				localStorage: {
					getItem: () => {
						throw new Error("blocked")
					},
				},
			} as unknown as Window,
		)

		expect(safeGetItem("rein_auth_token")).toBeNull()
	})

	it("returns false when localStorage access throws on write", () => {
		vi.stubGlobal(
			"window",
			{
				localStorage: {
					setItem: () => {
						throw new Error("blocked")
					},
				},
			} as unknown as Window,
		)

		expect(safeSetItem("rein_auth_token", "token")).toBe(false)
	})

	it("falls back when stored number is invalid", () => {
		vi.stubGlobal(
			"window",
			{
				localStorage: {
					getItem: () => "not-a-number",
				},
			} as unknown as Window,
		)

		expect(getStoredNumber("rein_sensitivity", 1)).toBe(1)
	})

	it("falls back when stored boolean is malformed", () => {
		vi.stubGlobal(
			"window",
			{
				localStorage: {
					getItem: () => "{oops",
				},
			} as unknown as Window,
		)

		expect(getStoredBoolean("rein_invert", false)).toBe(false)
	})

	it("supports JSON encoded booleans", () => {
		vi.stubGlobal(
			"window",
			{
				localStorage: {
					getItem: () => "true",
				},
			} as unknown as Window,
		)

		expect(getStoredBoolean("rein_invert", false)).toBe(true)
	})
})
