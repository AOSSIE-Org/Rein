/**
 * Safe localStorage accessors for restricted contexts (private browsing,
 * embedded webviews, blocked storage). Never throw to the UI.
 */

export function getLocalStorageItem(key: string): string | null {
	try {
		if (typeof localStorage === "undefined") return null
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

/** @returns false when storage is unavailable or the write failed */
export function setLocalStorageItem(key: string, value: string): boolean {
	try {
		if (typeof localStorage === "undefined") return false
		localStorage.setItem(key, value)
		return true
	} catch {
		return false
	}
}
