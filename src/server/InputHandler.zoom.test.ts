import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import type { InputConfig, PlatformInjector } from "./types.ts"

// Force the stub injector so these tests never touch real input devices.
vi.mock("node:os", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:os")>()
	return { ...real, default: { ...real, platform: () => "other" } }
})

/**
 * Fake injector that applies `invertScroll` to the wheel exactly like the real
 * drivers do in `injectMouseWheel` (linux, mac and windows), and records both
 * the raw call and the direction the OS finally receives.
 */
function setup(invertScroll: boolean) {
	const handler = new InputHandler({ invertScroll }, 0)
	const config = { invertScroll } as InputConfig
	const calls: string[] = []
	const osWheel: number[] = []
	const injector = {
		updateConfig: (c: Partial<InputConfig>) => Object.assign(config, c),
		injectMouseWheel: (dx: number, dy: number) => {
			calls.push(`wheel:${dx},${dy}`)
			osWheel.push(config.invertScroll ? -dy : dy)
		},
		injectKey: (key: string, pos: string) => calls.push(`${key}:${pos}`),
	} as unknown as PlatformInjector
	;(handler as unknown as { injector: PlatformInjector }).injector = injector

	const zoom = (delta: number) => handler.handleMessage({ type: "zoom", delta })
	const total = () => osWheel.reduce((a, b) => a + b, 0)
	return { handler, calls, osWheel, zoom, total }
}

describe("InputHandler pinch zoom", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("wraps each wheel step in a Ctrl hold and release", async () => {
		const { calls, zoom } = setup(false)

		await zoom(8)

		expect(calls).toEqual(["control:HOLD", "wheel:0,-4", "control:RELEASE"])
	})

	it("zooms in the same direction whether or not scrolling is inverted", async () => {
		const normal = setup(false)
		const inverted = setup(true)

		await normal.zoom(8)
		await inverted.zoom(8)
		await normal.zoom(-8)
		await inverted.zoom(-8)

		expect(normal.osWheel).toEqual([-4, 4])
		expect(inverted.osWheel).toEqual(normal.osWheel)
	})

	it("follows invertScroll changes made at runtime", async () => {
		const { handler, osWheel, zoom } = setup(false)

		handler.updateConfig({ invertScroll: true })
		await zoom(8)

		expect(osWheel).toEqual([-4])
	})

	it("accumulates small deltas so a slow pinch still zooms", async () => {
		const { osWheel, zoom, total } = setup(false)

		// 30 touchmove events of 0.8 px each, 16 ms apart: 30 * 0.8 * 0.5 = 12 steps.
		for (let i = 0; i < 30; i++) {
			vi.advanceTimersByTime(16)
			await zoom(0.8)
		}

		expect(total()).toBe(-12)
		expect(osWheel.every((step) => step === -1)).toBe(true)
	})

	it("caps a single event at the maximum zoom step", async () => {
		const { osWheel, zoom } = setup(false)

		await zoom(1000)

		expect(osWheel).toEqual([-5])
	})

	it("drops the leftover fraction when the pinch changes direction", async () => {
		const { total, zoom } = setup(false)

		await zoom(1.6) // 0.8 step, below one wheel tick
		await zoom(-1.6) // reverses: must not cancel out against the old remainder

		expect(total()).toBe(0)
		await zoom(-0.8) // -0.8 - 0.4 = -1.2 in the new direction
		expect(total()).toBe(1)
	})

	it("drops the leftover fraction after a pause", async () => {
		const { total, zoom } = setup(false)

		await zoom(1.6) // 0.8 step pending
		vi.advanceTimersByTime(1000)
		await zoom(0.8) // a new pinch: 0.4, not 1.2

		expect(total()).toBe(0)
	})

	it("ignores zero and non-finite deltas", async () => {
		const { calls, zoom } = setup(false)

		await zoom(0)
		await zoom(Number.NaN)
		await zoom(Number.POSITIVE_INFINITY)

		expect(calls).toEqual([])
	})
})
