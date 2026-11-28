import { afterEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import { MAX_COORD, MAX_KEY_LENGTH, MAX_TEXT_LENGTH } from "./constants.ts"
import type { InputConfig, PlatformInjector } from "./types.ts"

vi.mock("node:os", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:os")>()
	return { ...real, default: { ...real, platform: () => "other" } }
})

function setup() {
	const handler = new InputHandler(
		{ acceleration: false, screenWidth: 1920, screenHeight: 1080 },
		0,
	)
	const config: InputConfig = {
		sensitivity: 1,
		invertScroll: false,
		acceleration: false,
		screenWidth: 1920,
		screenHeight: 1080,
	}
	const calls: Array<{ method: string; args: unknown[] }> = []
	const record = (method: string, ...args: unknown[]) =>
		calls.push({ method, args })
	const injector: PlatformInjector = {
		updateConfig: (next) => Object.assign(config, next),
		injectMouseMove: (...args) => record("move", ...args),
		injectMouseAbsolute: (...args) => record("absolute", ...args),
		injectMouseButton: (...args) => record("button", ...args),
		injectMouseWheel: (...args) => record("wheel", ...args),
		injectKey: (...args) => record("key", ...args),
		injectCombo: (...args) => record("combo", ...args),
		injectText: (...args) => record("text", ...args),
		injectTouch: (...args) => record("touch", ...args),
		injectGamepadButton: (...args) => record("gamepad", ...args),
		injectGamepadAxis: (...args) => record("axis", ...args),
		destroy: () => record("destroy"),
	}
	Object.defineProperty(handler, "injector", { value: injector })
	return { handler, calls }
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe("InputHandler input validation", () => {
	it("clamps finite coordinates and replaces non-finite values before dispatch", async () => {
		const { handler, calls } = setup()
		await handler.handleMessage({
			type: "move",
			dx: MAX_COORD * 3,
			dy: Number.NaN,
		})

		expect(calls).toEqual([{ method: "move", args: [MAX_COORD, 0] }])
	})

	it("clamps absolute click ratios to the screen bounds and routes valid buttons", async () => {
		const { handler, calls } = setup()
		await handler.handleMessage({
			type: "absoluteClick",
			button: "right",
			press: true,
			x: -0.5,
			y: 1.5,
		})

		expect(calls).toEqual([
			{ method: "absolute", args: [0, 1080] },
			{ method: "button", args: ["right", true] },
		])
	})

	it("ignores unsupported mouse buttons and clicks without a boolean press state", async () => {
		const { handler, calls } = setup()
		const invalidButton: unknown = JSON.parse(
			'{"type":"click","button":"side","press":true}',
		)
		const invalidPress: unknown = JSON.parse(
			'{"type":"click","button":"left","press":"down"}',
		)
		await Reflect.apply(handler.handleMessage, handler, [invalidButton])
		await Reflect.apply(handler.handleMessage, handler, [invalidPress])

		expect(calls).toEqual([])
	})

	it("rejects unusable or oversized keys and normalizes the space key", async () => {
		const { handler, calls } = setup()
		await handler.handleMessage({ type: "key", key: "Unidentified" })
		await handler.handleMessage({ type: "key", key: "Process" })
		await handler.handleMessage({
			type: "key",
			key: "x".repeat(MAX_KEY_LENGTH + 1),
		})
		await handler.handleMessage({ type: "key", key: " " })

		expect(calls).toEqual([{ method: "key", args: ["space", ""] }])
	})

	it("truncates text to the maximum accepted payload length", async () => {
		const { handler, calls } = setup()
		await handler.handleMessage({
			type: "text",
			text: "a".repeat(MAX_TEXT_LENGTH + 10),
		})

		expect(calls).toEqual([
			{ method: "text", args: ["a".repeat(MAX_TEXT_LENGTH)] },
		])
	})

	it("filters invalid keys from combos and skips the combo when none are usable", async () => {
		const { handler, calls } = setup()
		const partlyInvalid: unknown = JSON.parse(
			'{"type":"combo","keys":["control",3,"c"]}',
		)
		const allInvalid: unknown = JSON.parse('{"type":"combo","keys":[3,null]}')
		await Reflect.apply(handler.handleMessage, handler, [partlyInvalid])
		await Reflect.apply(handler.handleMessage, handler, [allInvalid])

		expect(calls).toEqual([{ method: "combo", args: [["control", "c"]] }])
	})
})
