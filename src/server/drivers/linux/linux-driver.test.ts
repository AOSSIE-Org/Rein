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
		events: RecordedEvent[] = []
		syncCount = 0
		destroyed = false

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
	})

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			configurable: true,
		})
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
})
