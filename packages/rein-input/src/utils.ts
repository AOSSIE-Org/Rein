import { SHIFTED_CHARS } from "./keyMap"
import type { InputConfig } from "./types"
import { ACCEL_THRESHOLD, ACCEL_FACTOR, ACCEL_EXPONENT } from "./constants"

/**
 * Calculates accelerated and scaled delta coordinates based on input configuration.
 */
export function applyMotion(
	dx: number,
	dy: number,
	config: InputConfig,
): { ax: number; ay: number } {
	const sdx = dx * config.sensitivity
	const sdy = dy * config.sensitivity

	if (!config.acceleration) return { ax: sdx, ay: sdy }

	const mag = Math.sqrt(sdx * sdx + sdy * sdy)
	if (mag < ACCEL_THRESHOLD) return { ax: sdx, ay: sdy }

	const acc = mag ** ACCEL_EXPONENT * ACCEL_FACTOR
	const ratio = acc / mag
	return { ax: sdx * ratio, ay: sdy * ratio }
}

/**
 * Resolves a character into its platform-specific keycode and whether shift is required.
 */
export function resolveChar(
	ch: string,
	map: Record<string, number>,
): { code?: number; shifted: boolean } {
	if (ch >= "A" && ch <= "Z") {
		return { code: map[ch.toLowerCase()], shifted: true }
	}
	const direct = map[ch]
	if (direct !== undefined) return { code: direct, shifted: false }
	const base = SHIFTED_CHARS[ch]
	if (base !== undefined) {
		return { code: map[base], shifted: true }
	}
	return { code: undefined, shifted: false }
}
