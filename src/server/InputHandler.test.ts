import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InputHandler } from "./InputHandler.ts"
import type { PlatformInjector } from "./types.ts"

vi.mock("node:os", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:os")>()
	return { ...real, default: { ...real, platform: () => "other" } }
})

function setup(
	options: { failKeyRelease?: string; failClickDown?: boolean } = {},
) {
	const handler = new InputHandler({}, 0)
	const calls: string[] = []
	let clickDownFailed = false
	const injector: PlatformInjector = {
		updateConfig: () => {},
		injectMouseMove: () => {},
		injectMouseAbsolute: () => calls.push("absolute"),
		injectMouseButton: (button, isDown) => {
			calls.push(`mouse:${button}:${isDown}`)
			if (options.failClickDown && isDown && !clickDownFailed) {
				clickDownFailed = true
				throw new Error("mouse press failed")
			}
		},
		injectMouseWheel: () => {},
		injectKey: (key, pos = "") => {
			calls.push(`key:${key}:${pos}`)
			if (key === options.failKeyRelease && pos === "RELEASE") {
				throw new Error("key release failed")
			}
		},
		injectCombo: () => {},
		injectText: () => {},
		injectTouch: () => {},
		injectGamepadButton: (button, isDown) =>
			calls.push(`gamepad:${button}:${isDown}`),
		injectGamepadAxis: () => {},
		destroy: () => calls.push("destroy"),
	}
	Object.defineProperty(handler, "injector", { value: injector })
	return { handler, calls }
}

describe("InputHandler held input cleanup", () => {
	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(console, "log").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("releases held keys, mouse buttons, and gamepad buttons before destroying", async () => {
		const { handler, calls } = setup()

		await handler.handleMessage({ type: "key", key: " ", pos: "HOLD" })
		await handler.handleMessage({ type: "click", button: "left", press: true })
		await handler.handleMessage({
			type: "absoluteClick",
			button: "right",
			press: true,
			x: 0.5,
			y: 0.5,
		})
		await handler.handleMessage({ type: "gamepad", button: "a", press: true })

		handler.destroy()

		expect(calls).toEqual([
			"key:space:HOLD",
			"mouse:left:true",
			"absolute",
			"mouse:right:true",
			"gamepad:a:true",
			"key:space:RELEASE",
			"mouse:left:false",
			"mouse:right:false",
			"gamepad:a:false",
			"destroy",
		])
	})

	it("does not release inputs again after their release messages", async () => {
		const { handler, calls } = setup()

		await handler.handleMessage({ type: "key", key: "space", pos: "HOLD" })
		await handler.handleMessage({ type: "key", key: "space", pos: "RELEASE" })
		await handler.handleMessage({ type: "click", button: "left", press: true })
		await handler.handleMessage({ type: "click", button: "left", press: false })
		await handler.handleMessage({
			type: "absoluteClick",
			button: "right",
			press: true,
			x: 0.5,
			y: 0.5,
		})
		await handler.handleMessage({
			type: "absoluteClick",
			button: "right",
			press: false,
			x: 0.5,
			y: 0.5,
		})
		await handler.handleMessage({ type: "gamepad", button: "a", press: true })
		await handler.handleMessage({ type: "gamepad", button: "a", press: false })

		handler.destroy()

		expect(calls.filter((call) => call === "key:space:RELEASE")).toHaveLength(1)
		expect(calls.filter((call) => call === "mouse:left:false")).toHaveLength(1)
		expect(calls.filter((call) => call === "mouse:right:false")).toHaveLength(1)
		expect(calls.filter((call) => call === "gamepad:a:false")).toHaveLength(1)
		expect(calls.at(-1)).toBe("destroy")
	})

	it("continues releasing remaining inputs if a release throws", async () => {
		const { handler, calls } = setup({ failKeyRelease: "first" })

		await handler.handleMessage({ type: "key", key: "first", pos: "HOLD" })
		await handler.handleMessage({ type: "key", key: "second", pos: "HOLD" })
		await handler.handleMessage({ type: "click", button: "left", press: true })
		await handler.handleMessage({ type: "gamepad", button: "a", press: true })

		expect(() => handler.destroy()).not.toThrow()
		expect(calls.slice(-5)).toEqual([
			"key:first:RELEASE",
			"key:second:RELEASE",
			"mouse:left:false",
			"gamepad:a:false",
			"destroy",
		])
	})

	it("does not retry a click-down that was released during error recovery", async () => {
		const { handler, calls } = setup({ failClickDown: true })

		await handler.handleMessage({ type: "click", button: "left", press: true })
		handler.destroy()

		expect(calls).toEqual(["mouse:left:true", "mouse:left:false", "destroy"])
	})
})
