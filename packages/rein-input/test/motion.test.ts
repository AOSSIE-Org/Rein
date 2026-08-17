import { describe, it, expect } from "vitest"
import { applyMotion } from "../src/utils"
import { DEFAULT_CONFIG, ACCEL_FACTOR, ACCEL_EXPONENT } from "../src/constants"
import type { InputConfig } from "../src/types"

describe("applyMotion utility", () => {
	it("returns (0, 0) when dx and dy are 0", () => {
		const result = applyMotion(0, 0, DEFAULT_CONFIG)
		expect(result).toEqual({ ax: 0, ay: 0 })
	})

	it("applies sensitivity scaling linearly without acceleration", () => {
		const config: InputConfig = {
			...DEFAULT_CONFIG,
			sensitivity: 2.0,
			acceleration: false,
		}
		const result = applyMotion(5, -10, config)
		expect(result.ax).toBe(10)
		expect(result.ay).toBe(-20)
	})

	it("returns linear motion when magnitude is below ACCEL_THRESHOLD even with acceleration enabled", () => {
		const config: InputConfig = {
			...DEFAULT_CONFIG,
			sensitivity: 0.5,
			acceleration: true,
		}
		// dx=1, dy=0 => mag = 0.5 < ACCEL_THRESHOLD (1)
		const result = applyMotion(1, 0, config)
		expect(result.ax).toBe(0.5)
		expect(result.ay).toBe(0)
	})

	it("applies non-linear exponential curve when magnitude exceeds ACCEL_THRESHOLD", () => {
		const config: InputConfig = {
			...DEFAULT_CONFIG,
			sensitivity: 1.0,
			acceleration: true,
		}
		const dx = 10
		const dy = 0
		const mag = 10
		const expectedAcc = mag ** ACCEL_EXPONENT * ACCEL_FACTOR
		const expectedAx = mag * (expectedAcc / mag)

		const result = applyMotion(dx, dy, config)
		expect(result.ax).toBeCloseTo(expectedAx, 5)
		expect(result.ay).toBe(0)
	})

	it("preserves directional ratio on diagonal motion", () => {
		const config: InputConfig = {
			...DEFAULT_CONFIG,
			sensitivity: 1.5,
			acceleration: true,
		}
		const result = applyMotion(10, 10, config)
		expect(result.ax).toBe(result.ay)
		expect(result.ax).toBeGreaterThan(15) // Accelerated beyond linear (10 * 1.5)
	})
})
