import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import type { PlatformInjector } from "./types.ts"

// Force the stub injector so these tests never touch real input devices.
vi.mock("node:os", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:os")>()
	return { ...real, default: { ...real, platform: () => "other" } }
})

const THROTTLE_MS = 8

/**
 * Records every move and wheel call the OS would receive. Acceleration is off
 * and sensitivity is 1, so injected move deltas equal the deltas that were sent.
 */
function setup() {
	const handler = new InputHandler(
		{ acceleration: false, sensitivity: 1 },
		THROTTLE_MS,
	)
	const moves: [number, number][] = []
	const wheels: [number, number][] = []
	const injector: PlatformInjector = {
		updateConfig: () => {},
		injectMouseMove: (dx: number, dy: number) => {
			moves.push([dx, dy])
		},
		injectMouseAbsolute: () => {},
		injectMouseButton: () => {},
		injectMouseWheel: (dx: number, dy: number) => {
			wheels.push([dx, dy])
		},
		injectKey: () => {},
		injectCombo: () => {},
		injectText: () => {},
		injectTouch: () => {},
		injectGamepadButton: () => {},
		injectGamepadAxis: () => {},
		destroy: () => {},
	}
	;(handler as unknown as { injector: PlatformInjector }).injector = injector

	const sum = (calls: [number, number][]) =>
		calls.reduce<[number, number]>(
			([x, y], [dx, dy]) => [x + dx, y + dy],
			[0, 0],
		)
	return { handler, moves, wheels, sum }
}

describe("InputHandler throttling", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps all move distance when moves arrive inside one throttle window", async () => {
		const { handler, moves, sum } = setup()

		for (let i = 0; i < 4; i++) {
			await handler.handleMessage({ type: "move", dx: 10, dy: -5 })
			vi.advanceTimersByTime(2)
		}
		vi.advanceTimersByTime(THROTTLE_MS)

		expect(sum(moves)).toEqual([40, -20])
		// The first move goes out immediately, the other three are merged into one
		expect(moves).toHaveLength(2)
	})

	it("keeps all scroll distance when scrolls arrive inside one throttle window", async () => {
		const { handler, wheels, sum } = setup()

		for (let i = 0; i < 3; i++) {
			await handler.handleMessage({ type: "scroll", dx: 0, dy: 3 })
			vi.advanceTimersByTime(1)
		}
		vi.advanceTimersByTime(THROTTLE_MS)

		expect(sum(wheels)).toEqual([0, 9])
		expect(wheels).toHaveLength(2)
	})

	it("does not mix move and scroll deltas", async () => {
		const { handler, moves, wheels, sum } = setup()

		await handler.handleMessage({ type: "move", dx: 1, dy: 1 })
		await handler.handleMessage({ type: "scroll", dx: 0, dy: 2 })
		await handler.handleMessage({ type: "move", dx: 4, dy: 4 })
		await handler.handleMessage({ type: "scroll", dx: 0, dy: 5 })
		vi.advanceTimersByTime(THROTTLE_MS)

		expect(sum(moves)).toEqual([5, 5])
		expect(sum(wheels)).toEqual([0, 7])
	})

	it("sends moves straight through when they are spaced beyond the window", async () => {
		const { handler, moves } = setup()

		for (let i = 0; i < 3; i++) {
			await handler.handleMessage({ type: "move", dx: 2, dy: 0 })
			vi.advanceTimersByTime(THROTTLE_MS)
		}

		expect(moves).toEqual([
			[2, 0],
			[2, 0],
			[2, 0],
		])
	})
})
