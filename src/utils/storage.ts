export function safeGetItem(key: string): string | null {
	if (typeof window === "undefined") return null

	try {
		return window.localStorage.getItem(key)
	} catch {
		return null
	}
}

export function safeSetItem(key: string, value: string): boolean {
	if (typeof window === "undefined") return false

	try {
		window.localStorage.setItem(key, value)
		return true
	} catch {
		return false
	}
}

export function getStoredNumber(key: string, fallback: number): number {
	const saved = safeGetItem(key)
	if (saved === null) return fallback

	const parsed = Number.parseFloat(saved)
	return Number.isFinite(parsed) ? parsed : fallback
}

export function getStoredBoolean(key: string, fallback: boolean): boolean {
	const saved = safeGetItem(key)
	if (saved === null) return fallback
	if (saved === "true") return true
	if (saved === "false") return false

	try {
		const parsed = JSON.parse(saved)
		return typeof parsed === "boolean" ? parsed : fallback
	} catch {
		return fallback
	}
}
