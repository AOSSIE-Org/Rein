import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import type { PlatformInjector } from "./types.ts"

vi.mock("node:os", () => ({ default: { platform: () => "unsupported" } }))

function createHandler() {
	const handler = new InputHandler({ sensitivity: 1, acceleration: false }, 8)
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
})
