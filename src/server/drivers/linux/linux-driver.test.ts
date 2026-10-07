import type { UinputDevice } from "@imxade/inject/linux"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LINUX_KEY_MAP } from "../keyMap.ts"
import {
	ABS_HAT0Y,
	ABS_MT_POSITION_X,
	ABS_MT_POSITION_Y,
	ABS_MT_PRESSURE,
	ABS_MT_SLOT,
	ABS_MT_TOUCH_MAJOR,
	ABS_MT_TRACKING_ID,
	ABS_X,
	ABS_Y,
	ABS_Z,
	BTN_A,
	BTN_LEFT,
	BTN_TOOL_DOUBLETAP,
	BTN_TOOL_FINGER,
	BTN_TOOL_QUADTAP,
	BTN_TOOL_TRIPLETAP,
	BTN_TOUCH,
	EV_ABS,
	EV_KEY,
	EV_REL,
	KEY_PRESS,
	KEY_RELEASE,
	MT_TRACKING_ID_RELEASED,
	REL_WHEEL,
	REL_X,
	REL_Y,
} from "./constants.ts"
import { LinuxGamepad } from "./gamepad.ts"
import { LinuxInputInjector } from "./index.ts"
import { LinuxKeyboard } from "./keyboard.ts"
import { LinuxTouch } from "./touch.ts"

const { MockUinputDevice } = vi.hoisted(() => {
	interface RecordedEvent {
		type: number
		code: number
		value: number
	}

	class MockUinputDevice {
		static instances: MockUinputDevice[] = []
		static onConstruct?: (dev: MockUinputDevice) => void

		options?: { name?: string; identity?: unknown }
		events: RecordedEvent[] = []
		syncCount = 0
		destroyed = false
		createError: Error | null = null
		destroyError: Error | null = null

		constructor(options?: { name?: string; identity?: unknown }) {
			this.options = options
			MockUinputDevice.instances.push(this)
			MockUinputDevice.onConstruct?.(this)
		}

		setEventBit(): this {
			return this
		}
		setKeyBit(): this {
			return this
		}
		setRelativeBit(): this {
			return this
		}
		setAbsoluteBit(): this {
			return this
		}
		setPropertyBit(): this {
			return this
		}
		configureAbsoluteAxis(): this {
			return this
		}
		create(): this {
			if (this.createError) {
				throw this.createError
			}
			return this
		}

		emit(type: number, code: number, value: number): this {
			this.events.push({ type, code, value })
			return this
		}

		sync(): this {
			this.syncCount++
			return this
		}

		destroy(): void {
			this.destroyed = true
			if (this.destroyError) {
				throw this.destroyError
			}
		}

		clear(): void {
			this.events = []
			this.syncCount = 0
		}
	}

	return { MockUinputDevice }
})

// Mock @imxade/inject/linux
vi.mock("@imxade/inject/linux", () => {
	return {
		UinputDevice: MockUinputDevice,
		EV_SYN: 0x00,
		EV_KEY: 0x01,
		EV_REL: 0x02,
		EV_ABS: 0x03,
		SYN_REPORT: 0x00,
	}
})

describe("LinuxKeyboard Driver Unit Tests", () => {
	let mockDevice: InstanceType<typeof MockUinputDevice>
	let keyboard: LinuxKeyboard

	beforeEach(() => {
		mockDevice = new MockUinputDevice()
		keyboard = new LinuxKeyboard(mockDevice as unknown as UinputDevice)
	})

	it("injects a normal key with press, release, and sync", () => {
		keyboard.injectKey("a", "")

		expect(mockDevice.events).toEqual([
			{ type: EV_KEY, code: LINUX_KEY_MAP.a, value: KEY_PRESS },
			{ type: EV_KEY, code: LINUX_KEY_MAP.a, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("handles HOLD position without releasing the key", () => {
		keyboard.injectKey("shift", "HOLD")

		expect(mockDevice.events).toEqual([
			{ type: EV_KEY, code: LINUX_KEY_MAP.shift, value: KEY_PRESS },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("handles RELEASE position without pressing the key", () => {
		keyboard.injectKey("shift", "RELEASE")

		expect(mockDevice.events).toEqual([
			{ type: EV_KEY, code: LINUX_KEY_MAP.shift, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("injects key combos in order and releases in reverse order", () => {
		keyboard.injectCombo(["control", "alt", "t"])

		const ctrl = LINUX_KEY_MAP.control
		const alt = LINUX_KEY_MAP.alt
		const t = LINUX_KEY_MAP.t

		expect(mockDevice.events).toEqual([
			// Presses in order
			{ type: EV_KEY, code: ctrl, value: KEY_PRESS },
			{ type: EV_KEY, code: alt, value: KEY_PRESS },
			{ type: EV_KEY, code: t, value: KEY_PRESS },
			// Releases in reverse order
			{ type: EV_KEY, code: t, value: KEY_RELEASE },
			{ type: EV_KEY, code: alt, value: KEY_RELEASE },
			{ type: EV_KEY, code: ctrl, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(2)
	})

	it("injects shifted text characters with shift modifier wrapper", () => {
		keyboard.injectText("!")

		const shift = LINUX_KEY_MAP.shift
		const one = LINUX_KEY_MAP["1"]

		expect(mockDevice.events).toEqual([
			{ type: EV_KEY, code: shift, value: KEY_PRESS },
			{ type: EV_KEY, code: one, value: KEY_PRESS },
			{ type: EV_KEY, code: one, value: KEY_RELEASE },
			{ type: EV_KEY, code: shift, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("handles single-character fallback in injectKey for symbols not in keymap", () => {
		keyboard.injectKey("!", "")

		const shift = LINUX_KEY_MAP.shift
		const one = LINUX_KEY_MAP["1"]

		expect(mockDevice.events).toEqual([
			{ type: EV_KEY, code: shift, value: KEY_PRESS },
			{ type: EV_KEY, code: one, value: KEY_PRESS },
			{ type: EV_KEY, code: one, value: KEY_RELEASE },
			{ type: EV_KEY, code: shift, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("ignores empty text without emitting events", () => {
		keyboard.injectText("")
		expect(mockDevice.events).toHaveLength(0)
		expect(mockDevice.syncCount).toBe(0)
	})
})

describe("LinuxTouch Driver Unit Tests", () => {
	let mockDevice: InstanceType<typeof MockUinputDevice>
	let touch: LinuxTouch

	beforeEach(() => {
		mockDevice = new MockUinputDevice()
		touch = new LinuxTouch(mockDevice as unknown as UinputDevice)
	})

	it("handles single contact down, move, and up lifecycle", () => {
		// Contact Down
		touch.injectTouch([{ id: 101, x: 120, y: 240, state: "down" }])

		expect(mockDevice.events).toEqual([
			{ type: EV_ABS, code: ABS_MT_SLOT, value: 0 },
			{ type: EV_ABS, code: ABS_MT_TRACKING_ID, value: 2 },
			{ type: EV_ABS, code: ABS_MT_POSITION_X, value: 120 },
			{ type: EV_ABS, code: ABS_MT_POSITION_Y, value: 240 },
			{ type: EV_ABS, code: ABS_MT_PRESSURE, value: 128 },
			{ type: EV_ABS, code: ABS_MT_TOUCH_MAJOR, value: 4 },
			{ type: EV_KEY, code: BTN_TOUCH, value: KEY_PRESS },
			{ type: EV_KEY, code: BTN_TOOL_FINGER, value: KEY_PRESS },
			{ type: EV_KEY, code: BTN_TOOL_DOUBLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_TRIPLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_QUADTAP, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)

		mockDevice.clear()

		// Contact Move
		touch.injectTouch([{ id: 101, x: 130, y: 250, state: "move" }])
		expect(mockDevice.events).toEqual([
			{ type: EV_ABS, code: ABS_MT_SLOT, value: 0 },
			{ type: EV_ABS, code: ABS_MT_POSITION_X, value: 130 },
			{ type: EV_ABS, code: ABS_MT_POSITION_Y, value: 250 },
			{ type: EV_ABS, code: ABS_MT_PRESSURE, value: 128 },
			{ type: EV_ABS, code: ABS_MT_TOUCH_MAJOR, value: 4 },
			{ type: EV_KEY, code: BTN_TOUCH, value: KEY_PRESS },
			{ type: EV_KEY, code: BTN_TOOL_FINGER, value: KEY_PRESS },
			{ type: EV_KEY, code: BTN_TOOL_DOUBLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_TRIPLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_QUADTAP, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)

		mockDevice.clear()

		// Contact Up
		touch.injectTouch([{ id: 101, x: 130, y: 250, state: "up" }])
		expect(mockDevice.events).toEqual([
			{ type: EV_ABS, code: ABS_MT_SLOT, value: 0 },
			{
				type: EV_ABS,
				code: ABS_MT_TRACKING_ID,
				value: MT_TRACKING_ID_RELEASED,
			},
			{ type: EV_KEY, code: BTN_TOUCH, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_FINGER, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_DOUBLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_TRIPLETAP, value: KEY_RELEASE },
			{ type: EV_KEY, code: BTN_TOOL_QUADTAP, value: KEY_RELEASE },
		])
		expect(mockDevice.syncCount).toBe(1)
	})

	it("allocates discrete slots and updates tool buttons for multitouch contacts", () => {
		touch.injectTouch([
			{ id: 1, x: 100, y: 100, state: "down" },
			{ id: 2, x: 200, y: 200, state: "down" },
		])

		const events = mockDevice.events
		const btnDoubleTap = events.find((e) => e.code === BTN_TOOL_DOUBLETAP)
		const btnFinger = events.find((e) => e.code === BTN_TOOL_FINGER)

		expect(btnDoubleTap).toEqual({
			type: EV_KEY,
			code: BTN_TOOL_DOUBLETAP,
			value: KEY_PRESS,
		})
		expect(btnFinger).toEqual({
			type: EV_KEY,
			code: BTN_TOOL_FINGER,
			value: KEY_RELEASE,
		})

		mockDevice.clear()

		touch.injectTouch([{ id: 3, x: 300, y: 300, state: "down" }])
		const tripleEvents = mockDevice.events
		const btnTripleTap = tripleEvents.find((e) => e.code === BTN_TOOL_TRIPLETAP)
		expect(btnTripleTap).toEqual({
			type: EV_KEY,
			code: BTN_TOOL_TRIPLETAP,
			value: KEY_PRESS,
		})
	})

	it("releaseAll releases all active contacts and resets slots", () => {
		touch.injectTouch([
			{ id: 1, x: 10, y: 10, state: "down" },
			{ id: 2, x: 20, y: 20, state: "down" },
		])
		mockDevice.clear()

		touch.releaseAll()

		const releaseTrackingEvents = mockDevice.events.filter(
			(e) =>
				e.type === EV_ABS &&
				e.code === ABS_MT_TRACKING_ID &&
				e.value === MT_TRACKING_ID_RELEASED,
		)
		expect(releaseTrackingEvents).toHaveLength(2)

		const btnTouchRelease = mockDevice.events.find(
			(e) =>
				e.type === EV_KEY && e.code === BTN_TOUCH && e.value === KEY_RELEASE,
		)
		expect(btnTouchRelease).toBeDefined()
		expect(mockDevice.syncCount).toBe(1)

		mockDevice.clear()
		touch.releaseAll()
		expect(mockDevice.events).toHaveLength(0)
		expect(mockDevice.syncCount).toBe(0)
	})
})

describe("LinuxGamepad Driver Unit Tests", () => {
	let mockDevice: InstanceType<typeof MockUinputDevice>
	let gamepad: LinuxGamepad

	beforeEach(() => {
		mockDevice = new MockUinputDevice()
		gamepad = new LinuxGamepad(mockDevice as unknown as UinputDevice)
	})

	it("injects digital buttons and dual D-pad hat values", () => {
		gamepad.injectGamepadButton("a", true)
		expect(mockDevice.events).toContainEqual({
			type: EV_KEY,
			code: BTN_A,
			value: KEY_PRESS,
		})

		mockDevice.clear()
		gamepad.injectGamepadButton("dpad-up", true)
		expect(mockDevice.events).toContainEqual({
			type: EV_ABS,
			code: ABS_HAT0Y,
			value: -1,
		})

		mockDevice.clear()
		gamepad.injectGamepadButton("dpad-down", true)
		expect(mockDevice.events).toContainEqual({
			type: EV_ABS,
			code: ABS_HAT0Y,
			value: 1,
		})
	})

	it("injects analog triggers", () => {
		gamepad.injectGamepadButton("lt", true)
		expect(mockDevice.events).toContainEqual({
			type: EV_ABS,
			code: ABS_Z,
			value: 255,
		})
	})
})

describe("LinuxInputInjector Lifecycle & Pointer Unit Tests", () => {
	const originalPlatform = process.platform

	beforeEach(() => {
		Object.defineProperty(process, "platform", {
			value: "linux",
			configurable: true,
		})
		MockUinputDevice.instances = []
		MockUinputDevice.onConstruct = undefined
	})

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			configurable: true,
		})
		MockUinputDevice.instances = []
		MockUinputDevice.onConstruct = undefined
	})

	it("initializes successfully and manages virtual devices", () => {
		const injector = new LinuxInputInjector({
			screenWidth: 1920,
			screenHeight: 1080,
		})

		// Mouse relative move
		injector.injectMouseMove(15, -20)
		const mouseDev = (
			injector as unknown as {
				mouseDev: InstanceType<typeof MockUinputDevice>
			}
		).mouseDev
		expect(mouseDev.events).toEqual([
			{ type: EV_REL, code: REL_X, value: 15 },
			{ type: EV_REL, code: REL_Y, value: -20 },
		])
		expect(mouseDev.syncCount).toBe(1)

		// Mouse button
		mouseDev.clear()
		injector.injectMouseButton("left", true)
		expect(mouseDev.events).toEqual([
			{ type: EV_KEY, code: BTN_LEFT, value: KEY_PRESS },
		])
		expect(mouseDev.syncCount).toBe(1)

		// Mouse wheel
		mouseDev.clear()
		injector.injectMouseWheel(0, 1)
		expect(
			mouseDev.events.some((e) => e.type === EV_REL && e.code === REL_WHEEL),
		).toBe(true)

		// Absolute mouse
		const absMouseDev = (
			injector as unknown as {
				absMouseDev: InstanceType<typeof MockUinputDevice>
			}
		).absMouseDev
		injector.injectMouseAbsolute(960, 540)
		expect(
			absMouseDev.events.some((e) => e.type === EV_ABS && e.code === ABS_X),
		).toBe(true)
		expect(
			absMouseDev.events.some((e) => e.type === EV_ABS && e.code === ABS_Y),
		).toBe(true)

		// Destroy
		injector.destroy()
		expect(mouseDev.destroyed).toBe(true)
		expect(absMouseDev.destroyed).toBe(true)
	})

	it("throws an error if instantiated on non-Linux platform", () => {
		Object.defineProperty(process, "platform", {
			value: "darwin",
			configurable: true,
		})

		expect(() => new LinuxInputInjector()).toThrow(
			"LinuxInputInjector can only be used on Linux",
		)
	})

	it("rolls back initialization and destroys local and previous devices if create() fails", () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {})
		const creationError = new Error("Virtual keyboard create failure")
		MockUinputDevice.onConstruct = (dev) => {
			if (dev.options?.name === "Virtual Keyboard") {
				dev.createError = creationError
			}
		}

		expect(() => new LinuxInputInjector()).toThrow(
			"One or more virtual uinput devices failed to initialize (check /dev/uinput permissions)",
		)

		expect(MockUinputDevice.instances).toHaveLength(3)
		const [mouse, absMouse, keyboard] = MockUinputDevice.instances
		expect(keyboard.destroyed).toBe(true)
		expect(mouse.destroyed).toBe(true)
		expect(absMouse.destroyed).toBe(true)

		consoleErrorSpy.mockRestore()
	})

	it("preserves original creation error when local device cleanup also throws", () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {})
		const creationError = new Error("Device creation failed")
		const cleanupError = new Error("Cleanup destroy failed")

		MockUinputDevice.onConstruct = (dev) => {
			if (dev.options?.name === "Virtual Keyboard") {
				dev.createError = creationError
				dev.destroyError = cleanupError
			}
		}

		let caughtError: unknown
		try {
			new LinuxInputInjector()
		} catch (err) {
			caughtError = err
		}

		expect(caughtError).toBeInstanceOf(Error)
		expect((caughtError as Error).cause).toBe(creationError)
		expect(consoleErrorSpy).toHaveBeenCalled()

		consoleErrorSpy.mockRestore()
	})

	it("attempts cleanup for all remaining devices when one device destroy() throws", () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {})
		const injector = new LinuxInputInjector()
		const [mouse, absMouse, keyboard, touchpad, gamepad] =
			MockUinputDevice.instances

		const destroyErr = new Error("Mouse destroy failure")
		mouse.destroyError = destroyErr

		expect(() => injector.destroy()).toThrow(destroyErr)

		expect(absMouse.destroyed).toBe(true)
		expect(keyboard.destroyed).toBe(true)
		expect(touchpad.destroyed).toBe(true)
		expect(gamepad.destroyed).toBe(true)

		const state = injector as unknown as Record<string, unknown>
		expect(state.mouseDev).toBeNull()
		expect(state.absMouseDev).toBeNull()
		expect(state.kbDev).toBeNull()
		expect(state.touchDev).toBeNull()
		expect(state.gamepadDev).toBeNull()
		expect(state.initialized).toBe(false)

		consoleErrorSpy.mockRestore()
	})

	it("throws AggregateError when multiple devices fail during destroy()", () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {})
		const injector = new LinuxInputInjector()
		const [mouse, , keyboard] = MockUinputDevice.instances

		mouse.destroyError = new Error("Mouse destroy failure")
		keyboard.destroyError = new Error("Keyboard destroy failure")

		expect(() => injector.destroy()).toThrow(AggregateError)

		consoleErrorSpy.mockRestore()
	})

	it("cleans up failed gamepad device locally without breaking injector initialization", () => {
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {})
		MockUinputDevice.onConstruct = (dev) => {
			if (dev.options?.name === "Virtual Gamepad") {
				dev.createError = new Error("Gamepad node creation failure")
			}
		}

		const injector = new LinuxInputInjector()
		const gamepad = MockUinputDevice.instances[4]

		expect(gamepad.destroyed).toBe(true)
		const state = injector as unknown as {
			initialized: boolean
			gamepad: unknown
			gamepadDev: unknown
		}
		expect(state.initialized).toBe(true)
		expect(state.gamepad).toBeNull()
		expect(state.gamepadDev).toBeNull()

		injector.destroy()
		consoleWarnSpy.mockRestore()
	})
})
