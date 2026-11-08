import { beforeEach, describe, expect, it } from "vitest"
import { getLocalStorageItem, setLocalStorageItem } from "./safeLocalStorage"

describe("safeLocalStorage", () => {
	const store = new Map<string, string>()
	const mockStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => {
			store.set(k, v)
		},
	}

	beforeEach(() => {
		store.clear()
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: mockStorage,
		})
	})

	it("reads and writes when storage works", () => {
		expect(setLocalStorageItem("k", "v")).toBe(true)
		expect(getLocalStorageItem("k")).toBe("v")
	})

	it("returns null/false when getItem/setItem throw", () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: () => {
					throw new Error("blocked")
				},
				setItem: () => {
					throw new Error("blocked")
				},
			},
		})
		expect(getLocalStorageItem("k")).toBeNull()
		expect(setLocalStorageItem("k", "v")).toBe(false)
	})

	it("returns null/false when localStorage is unavailable", () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: undefined,
		})
		expect(getLocalStorageItem("k")).toBeNull()
		expect(setLocalStorageItem("k", "v")).toBe(false)
	})
})
