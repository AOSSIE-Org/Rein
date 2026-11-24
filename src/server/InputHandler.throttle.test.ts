import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import { MAX_COORD } from "./constants.ts"
import type { InputConfig, PlatformInjector } from "./types.ts"

// Force the stub injector so these tests never touch real input devices.
vi.mock("node:os", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:os")>()
	return { ...real, default: { ...real, platform: () => "other" } }
})

const THROTTLE_MS = 8

function setup() {
	// Acceleration off, so what the injector receives is exactly what was sent.
	const handler = new InputHandler({ acceleration: false }, THROTTLE_MS)
	const moves: Array<[number, number]> = []
	const wheels: Array<[number, number]> = []
	const injector = {
		updateConfig: (_c: Partial<InputConfig>) => {},
		injectMouseMove: (dx: number, dy: number) => moves.push([dx, dy]),
		injectMouseWheel: (dx: number, dy: number) => wheels.push([dx, dy]),
		destroy: () => {},
	} as unknown as PlatformInjector
	;(handler as unknown as { injector: PlatformInjector }).injector = injector

	const sum = (calls: Array<[number, number]>) =>
		calls.reduce<[number, number]>(
			([x, y], [dx, dy]) => [x + dx, y + dy],
			[0, 0],
		)
	return { handler, moves, wheels, sum }
}

describe("InputHandler throttling of relative deltas", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(100_000)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps the whole distance of moves that arrive in one burst", async () => {
		const { handler, moves, sum } = setup()
		for (let i = 0; i < 10; i++) {
			await handler.handleMessage({ type: "move", dx: 10, dy: -5 })
		}
		await vi.advanceTimersByTimeAsync(THROTTLE_MS)
		expect(sum(moves)).toEqual([100, -50])
	})

	it("keeps the whole distance when moves arrive 1 ms apart", async () => {
		const { handler, moves, sum } = setup()
		for (let i = 0; i < 120; i++) {
			await handler.handleMessage({ type: "move", dx: 10, dy: 0 })
			await vi.advanceTimersByTimeAsync(1)
		}
		await vi.advanceTimersByTimeAsync(THROTTLE_MS)
		expect(sum(moves)).toEqual([1200, 0])
		// The throttle still limits how often the injector is called.
		expect(moves.length).toBeLessThan(120)
	})

	it("keeps the whole distance of scroll messages in one burst", async () => {
		const { handler, wheels, sum } = setup()
		for (let i = 0; i < 6; i++) {
			await handler.handleMessage({ type: "scroll", dx: 1, dy: 3 })
		}
		await vi.advanceTimersByTimeAsync(THROTTLE_MS)
		expect(sum(wheels)).toEqual([6, 18])
	})

	it("does not mix pending move and scroll deltas", async () => {
		const { handler, moves, wheels, sum } = setup()
		for (let i = 0; i < 3; i++) {
			await handler.handleMessage({ type: "move", dx: 4, dy: 0 })
			await handler.handleMessage({ type: "scroll", dx: 0, dy: 2 })
		}
		await vi.advanceTimersByTimeAsync(THROTTLE_MS)
		expect(sum(moves)).toEqual([12, 0])
		expect(sum(wheels)).toEqual([0, 6])
	})

	it("keeps the summed delta inside the coordinate limit", async () => {
		const { handler, moves } = setup()
		for (let i = 0; i < 4; i++) {
			await handler.handleMessage({ type: "move", dx: MAX_COORD, dy: 0 })
		}
		await vi.advanceTimersByTimeAsync(THROTTLE_MS)
		for (const [dx] of moves) expect(dx).toBeLessThanOrEqual(MAX_COORD)
	})
})
