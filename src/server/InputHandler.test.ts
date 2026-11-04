import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import { DEFAULT_SCREEN_HEIGHT, DEFAULT_SCREEN_WIDTH } from "./constants.ts"
import { applyMotion } from "./drivers/utils.ts"
import type { PlatformInjector } from "./types.ts"

vi.mock("node:os", () => ({ default: { platform: () => "unsupported" } }))

function createHandler(acceleration = false) {
	const handler = new InputHandler({ sensitivity: 1, acceleration }, 8)
	const injector = {
		updateConfig: vi.fn(),
		injectMouseMove: vi.fn(),
		injectMouseAbsolute: vi.fn(),
		injectMouseButton: vi.fn(),
		injectMouseWheel: vi.fn(),
		injectKey: vi.fn(),
		injectCombo: vi.fn(),
		injectText: vi.fn(),
		injectTouch: vi.fn(),
		injectGamepadButton: vi.fn(),
		injectGamepadAxis: vi.fn(),
		destroy: vi.fn(),
	} satisfies PlatformInjector
	;(handler as unknown as { injector: PlatformInjector }).injector = injector
	return { handler, injector }
}

const total = (calls: unknown[][], index: number) =>
	calls.reduce((sum, call) => sum + (call[index] as number), 0)

describe("InputHandler throttling", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("keeps the full distance of moves that arrive within the throttle window", async () => {
		const { handler, injector } = createHandler()

		for (let i = 0; i < 5; i++) {
			await handler.handleMessage({ type: "move", dx: 10, dy: -4 })
		}
		await vi.advanceTimersByTimeAsync(50)

		expect(injector.injectMouseMove).toHaveBeenCalledTimes(2)
		expect(total(injector.injectMouseMove.mock.calls, 0)).toBe(50)
		expect(total(injector.injectMouseMove.mock.calls, 1)).toBe(-20)
		handler.destroy()
	})

	it("keeps the full distance of scrolls that arrive within the throttle window", async () => {
		const { handler, injector } = createHandler()

		for (let i = 0; i < 4; i++) {
			await handler.handleMessage({ type: "scroll", dx: 0, dy: 3 })
		}
		await vi.advanceTimersByTimeAsync(50)

		expect(total(injector.injectMouseWheel.mock.calls, 1)).toBe(12)
		handler.destroy()
	})

	it("applies acceleration per packet, not to the merged sum", async () => {
		const { handler, injector } = createHandler(true)

		for (let i = 0; i < 5; i++) {
			await handler.handleMessage({ type: "move", dx: 10, dy: 0 })
		}
		await vi.advanceTimersByTimeAsync(50)

		const perPacket = applyMotion(10, 0, {
			sensitivity: 1,
			acceleration: true,
			invertScroll: false,
			screenWidth: DEFAULT_SCREEN_WIDTH,
			screenHeight: DEFAULT_SCREEN_HEIGHT,
		}).ax
		expect(total(injector.injectMouseMove.mock.calls, 0)).toBeCloseTo(
			perPacket * 5,
		)
		handler.destroy()
	})

	it("does not clamp the merged move to MAX_COORD a second time", async () => {
		const { handler, injector } = createHandler()

		for (let i = 0; i < 3; i++) {
			await handler.handleMessage({ type: "move", dx: 1500, dy: 0 })
		}
		await vi.advanceTimersByTimeAsync(50)

		expect(total(injector.injectMouseMove.mock.calls, 0)).toBe(4500)
		handler.destroy()
	})

	it("flushes pending deltas before injecting a newer move", async () => {
		const { handler, injector } = createHandler()

		await handler.handleMessage({ type: "move", dx: 1, dy: 0 }) // t=0, injected
		await vi.advanceTimersByTimeAsync(1)
		await handler.handleMessage({ type: "move", dx: 2, dy: 0 }) // t=1, pending
		await vi.advanceTimersByTimeAsync(7)
		await handler.handleMessage({ type: "move", dx: 3, dy: 0 }) // t=8, timer still due at 9
		await vi.advanceTimersByTimeAsync(50)

		expect(injector.injectMouseMove.mock.calls.map((c) => c[0])).toEqual([1, 5])
		handler.destroy()
	})

	it("drops pending deltas on destroy", async () => {
		const { handler, injector } = createHandler()

		await handler.handleMessage({ type: "move", dx: 5, dy: 0 })
		await handler.handleMessage({ type: "move", dx: 5, dy: 0 })
		handler.destroy()
		await vi.advanceTimersByTimeAsync(50)

		expect(injector.injectMouseMove).toHaveBeenCalledTimes(1)
	})
})
