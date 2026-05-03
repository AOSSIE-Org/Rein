/**
 * Safe localStorage wrappers that fall back gracefully in restricted browser
 * contexts (private browsing, cross-origin iframes, storage blocked by policy).
 *
 * In these environments, accessing `localStorage` throws a `SecurityError`
 * rather than returning null, so a simple `typeof localStorage` check is not
 * sufficient. These helpers catch any thrown error and return the provided
 * fallback value instead.
 */

/**
 * Safely read a value from localStorage.
 * Returns `fallback` if storage is unavailable or the key does not exist.
 */
export function safeGetItem(key: string, fallback: string | null = null): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return fallback
	}
}

/**
 * Safely write a value to localStorage.
 * Silently does nothing if storage is unavailable.
 */
export function safeSetItem(key: string, value: string): void {
	try {
		localStorage.setItem(key, value)
	} catch {
		// Restricted context — ignore
	}
}
