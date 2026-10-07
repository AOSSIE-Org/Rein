/**
 * Linux uinput-based input injection implementation.
 *
 * Creates and manages virtual mouse, keyboard, and touch devices,
 * providing a unified interface for injecting input events. Handles
 * device initialization, capability registration, event injection,
 * and cleanup while delegating keyboard and touch logic to their
 * respective platform-specific modules.
 */
import { UinputDevice } from "@imxade/inject/linux"
import {
	EV_SYN,
	EV_KEY,
	EV_REL,
	EV_ABS,
	REL_X,
	REL_Y,
	REL_WHEEL,
	REL_HWHEEL,
	BTN_LEFT,
	BTN_RIGHT,
	BTN_MIDDLE,
	BTN_TOUCH,
	BTN_TOOL_FINGER,
	BTN_TOOL_DOUBLETAP,
	BTN_TOOL_TRIPLETAP,
	BTN_TOOL_QUADTAP,
	ABS_MT_SLOT,
	ABS_MT_TRACKING_ID,
	ABS_MT_POSITION_X,
	ABS_MT_POSITION_Y,
	ABS_MT_TOUCH_MAJOR,
	ABS_MT_PRESSURE,
	ABS_X,
	ABS_Y,
	ABS_Z,
	ABS_RX,
	ABS_RY,
	ABS_RZ,
	ABS_HAT0X,
	ABS_HAT0Y,
	MAX_CONTACTS,
	KEY_PRESS,
	KEY_RELEASE,
} from "./constants.ts"
import { WHEEL_SCALE } from "../../constants.ts"
import { LinuxKeyboard } from "./keyboard.ts"
import { LinuxTouch } from "./touch.ts"
import { LinuxGamepad, GAMEPAD_BUTTON_MAP } from "./gamepad.ts"
import { LINUX_KEY_MAP } from "../keyMap.ts"
import type { InputConfig, TouchContact } from "../../types.ts"
import { DEFAULT_CONFIG } from "../../constants.ts"

const BUS_USB = 0x03
const ABS_MAX_COORD = 65535

const DEVICE_IDENTITY = {
	bustype: BUS_USB,
	vendor: 0x1234,
	product: 0x5678,
	version: 1,
}

function createDevice(dev: UinputDevice): UinputDevice {
	try {
		dev.create()
		return dev
	} catch (createErr) {
		try {
			dev.destroy()
		} catch (cleanupErr) {
			console.error(
				"[LinuxInputInjector] Error cleaning up device after creation failure:",
				cleanupErr,
			)
		}
		throw createErr
	}
}

const activeInjectors = new Set<LinuxInputInjector>()

function cleanupAllInjectors(): void {
	for (const injector of activeInjectors) {
		try {
			injector.destroy()
		} catch {}
	}
	activeInjectors.clear()
}

if (typeof process !== "undefined") {
	process.once("exit", cleanupAllInjectors)
	process.once("SIGINT", () => {
		cleanupAllInjectors()
		process.kill(process.pid, "SIGINT")
	})
	process.once("SIGTERM", () => {
		cleanupAllInjectors()
		process.kill(process.pid, "SIGTERM")
	})
}

export class LinuxInputInjector {
	private config: InputConfig
	private mouseDev: UinputDevice | null = null
	private absMouseDev: UinputDevice | null = null
	private kbDev: UinputDevice | null = null
	private touchDev: UinputDevice | null = null
	private gamepadDev: UinputDevice | null = null
	private keyboard: LinuxKeyboard | null = null
	private touch: LinuxTouch | null = null
	private gamepad: LinuxGamepad | null = null
	private initialized = false
	private lastAbsX: number | null = null
	private lastAbsY: number | null = null

	constructor(config: Partial<InputConfig> = {}) {
		if (process.platform !== "linux") {
			throw new Error("LinuxInputInjector can only be used on Linux")
		}
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.initialize()
		if (!this.initialized) {
			throw new Error(
				"Linux virtual input devices failed to initialize (check /dev/uinput permissions)",
			)
		}
		activeInjectors.add(this)
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

	injectMouseMove(dx: number, dy: number): void {
		if (!this.initialized || (dx === 0 && dy === 0)) return
		this.mouseDev?.emit(EV_REL, REL_X, Math.round(dx))
		this.mouseDev?.emit(EV_REL, REL_Y, Math.round(dy))
		this.mouseDev?.sync()
	}

	// Warps the cursor to an absolute pixel position using a dedicated uinput ABS pointer device.
	// Bypasses mouse acceleration and relative delta scaling for exact pixel positioning.
	injectMouseAbsolute(x: number, y: number): void {
		if (!this.initialized || !this.absMouseDev) return

		// Normalize pixel coordinates against current config screen dimensions over fixed [0, 65535] range
		const width = Math.max(1, this.config.screenWidth)
		const height = Math.max(1, this.config.screenHeight)
		const normX = Math.round(
			Math.max(0, Math.min(ABS_MAX_COORD, (x / width) * ABS_MAX_COORD)),
		)
		const normY = Math.round(
			Math.max(0, Math.min(ABS_MAX_COORD, (y / height) * ABS_MAX_COORD)),
		)

		// Linux kernel filters unchanged EV_ABS values. If the target coordinates match the last written
		// values, write a 1-unit dummy offset first to force kernel absinfo state change.
		if (this.lastAbsX === normX) {
			const dummyX = normX > 0 ? normX - 1 : normX + 1
			this.absMouseDev.emit(EV_ABS, ABS_X, dummyX)
		}
		if (this.lastAbsY === normY) {
			const dummyY = normY > 0 ? normY - 1 : normY + 1
			this.absMouseDev.emit(EV_ABS, ABS_Y, dummyY)
		}

		this.absMouseDev.emit(EV_ABS, ABS_X, normX)
		this.absMouseDev.emit(EV_ABS, ABS_Y, normY)
		this.absMouseDev.sync()

		this.lastAbsX = normX
		this.lastAbsY = normY
	}

	injectMouseButton(
		button: "left" | "right" | "middle",
		isDown: boolean,
	): void {
		if (!this.initialized) return

		const codeMap = {
			left: BTN_LEFT,
			right: BTN_RIGHT,
			middle: BTN_MIDDLE,
		} as const
		const code = codeMap[button]

		this.mouseDev?.emit(EV_KEY, code, isDown ? KEY_PRESS : KEY_RELEASE)
		this.mouseDev?.sync()
	}

	injectMouseWheel(dx: number, dy: number): void {
		if (!this.initialized) return

		const invert = this.config.invertScroll ? -1 : 1

		if (dy !== 0) {
			// Positive dy = scroll down on trackpad
			const amount = Math.round(dy * invert * WHEEL_SCALE)
			this.mouseDev?.emit(EV_REL, REL_WHEEL, amount)
		}
		if (dx !== 0) {
			const amount = Math.round(dx * invert * WHEEL_SCALE)
			this.mouseDev?.emit(EV_REL, REL_HWHEEL, amount)
		}
		this.mouseDev?.sync()
	}

	// Keyboard
	injectKey(key: string, pos?: string): void {
		this.keyboard?.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard?.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard?.injectText(text)
	}

	// Touch

	injectTouch(contacts: TouchContact[]): void {
		this.touch?.injectTouch(contacts)
	}

	// Gamepad

	injectGamepadButton(button: string, isDown: boolean): void {
		this.gamepad?.injectGamepadButton(button, isDown)
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		this.gamepad?.injectGamepadAxis(axis, ax, ay)
	}

	// Cleanup

	destroy(): void {
		activeInjectors.delete(this)

		const cleanupTasks: Array<() => void> = [
			() => this.touch?.releaseAll(),
			() => this.mouseDev?.destroy(),
			() => this.absMouseDev?.destroy(),
			() => this.kbDev?.destroy(),
			() => this.touchDev?.destroy(),
			() => this.gamepadDev?.destroy(),
		]

		const errors: unknown[] = []

		for (const task of cleanupTasks) {
			try {
				task()
			} catch (err) {
				errors.push(err)
				console.error("[LinuxInputInjector] Error during device cleanup:", err)
			}
		}

		this.mouseDev = null
		this.absMouseDev = null
		this.kbDev = null
		this.touchDev = null
		this.gamepadDev = null
		this.keyboard = null
		this.touch = null
		this.gamepad = null
		this.initialized = false

		if (errors.length > 0) {
			if (typeof AggregateError !== "undefined" && errors.length > 1) {
				throw new AggregateError(
					errors,
					"[LinuxInputInjector] Failed to cleanly destroy all devices",
				)
			}
			throw errors[0]
		}
	}

	// helpers
	private initialize(): void {
		const createdDevices: UinputDevice[] = []
		try {
			this.mouseDev = this.setupMouseDevice()
			createdDevices.push(this.mouseDev)

			this.absMouseDev = this.setupAbsMouseDevice()
			createdDevices.push(this.absMouseDev)

			this.kbDev = this.setupKeyboardDevice()
			createdDevices.push(this.kbDev)

			this.touchDev = this.setupTouchDevice()
			createdDevices.push(this.touchDev)
		} catch (err) {
			for (const dev of createdDevices) {
				try {
					dev.destroy()
				} catch (cleanupErr) {
					console.error(
						"[LinuxInputInjector] Error destroying device during initialization rollback:",
						cleanupErr,
					)
				}
			}
			activeInjectors.delete(this)
			this.mouseDev = null
			this.absMouseDev = null
			this.kbDev = null
			this.touchDev = null
			this.gamepadDev = null
			this.keyboard = null
			this.touch = null
			this.gamepad = null
			this.initialized = false
			const msg =
				"One or more virtual uinput devices failed to initialize (check /dev/uinput permissions)"
			console.error(`[LinuxInputInjector] ${msg}`, err)
			throw new Error(msg, { cause: err })
		}

		this.keyboard = new LinuxKeyboard(this.kbDev)
		this.touch = new LinuxTouch(this.touchDev)

		// Gamepad is best-effort — failure does not block core mouse/keyboard/touch input
		try {
			this.gamepadDev = this.setupGamepadDevice()
			this.gamepad = new LinuxGamepad(this.gamepadDev)
		} catch (err) {
			this.gamepadDev = null
			this.gamepad = null
			console.warn(
				"[LinuxInputInjector] Virtual Gamepad device failed to initialize — gamepad injection disabled",
				err,
			)
		}

		this.initialized = true
		console.log(
			`[LinuxInputInjector] Virtual devices initialized (gamepad: ${this.gamepad ? "ok" : "unavailable"})`,
		)
	}

	private setupMouseDevice(): UinputDevice {
		const dev = new UinputDevice({
			name: "Virtual Mouse",
			identity: DEVICE_IDENTITY,
		})
		dev.setEventBit(EV_KEY)
		dev.setEventBit(EV_REL)
		dev.setEventBit(EV_SYN)

		dev.setKeyBit(BTN_LEFT)
		dev.setKeyBit(BTN_RIGHT)
		dev.setKeyBit(BTN_MIDDLE)

		dev.setRelativeBit(REL_X)
		dev.setRelativeBit(REL_Y)
		dev.setRelativeBit(REL_WHEEL)
		dev.setRelativeBit(REL_HWHEEL)

		return createDevice(dev)
	}

	private setupAbsMouseDevice(): UinputDevice {
		const dev = new UinputDevice({
			name: "Virtual Absolute Pointer",
			identity: DEVICE_IDENTITY,
		})
		dev.setEventBit(EV_ABS)
		dev.setEventBit(EV_KEY)
		dev.setEventBit(EV_SYN)

		dev.setKeyBit(BTN_LEFT)
		dev.setKeyBit(BTN_RIGHT)
		dev.setKeyBit(BTN_MIDDLE)

		dev.setAbsoluteBit(ABS_X)
		dev.setAbsoluteBit(ABS_Y)

		dev.configureAbsoluteAxis(ABS_X, { minimum: 0, maximum: ABS_MAX_COORD })
		dev.configureAbsoluteAxis(ABS_Y, { minimum: 0, maximum: ABS_MAX_COORD })

		return createDevice(dev)
	}

	private setupKeyboardDevice(): UinputDevice {
		const dev = new UinputDevice({
			name: "Virtual Keyboard",
			identity: DEVICE_IDENTITY,
		})

		dev.setEventBit(EV_KEY)
		dev.setEventBit(EV_SYN)

		// Register all key codes upfront
		for (const code of Object.values(LINUX_KEY_MAP)) {
			dev.setKeyBit(code)
		}

		return createDevice(dev)
	}

	private setupTouchDevice(): UinputDevice {
		const dev = new UinputDevice({
			name: "Virtual Touchpad",
			identity: DEVICE_IDENTITY,
		})

		dev.setEventBit(EV_ABS)
		dev.setEventBit(EV_KEY)
		dev.setEventBit(EV_SYN)

		// Touch buttons
		dev.setKeyBit(BTN_TOUCH)
		dev.setKeyBit(BTN_TOOL_FINGER)
		dev.setKeyBit(BTN_TOOL_DOUBLETAP)
		dev.setKeyBit(BTN_TOOL_TRIPLETAP)
		dev.setKeyBit(BTN_TOOL_QUADTAP)

		// Absolute axes
		dev.setAbsoluteBit(ABS_MT_SLOT)
		dev.setAbsoluteBit(ABS_MT_TRACKING_ID)
		dev.setAbsoluteBit(ABS_MT_POSITION_X)
		dev.setAbsoluteBit(ABS_MT_POSITION_Y)
		dev.setAbsoluteBit(ABS_MT_TOUCH_MAJOR)
		dev.setAbsoluteBit(ABS_MT_PRESSURE)
		dev.setAbsoluteBit(ABS_X)
		dev.setAbsoluteBit(ABS_Y)

		// Abs ranges
		dev.configureAbsoluteAxis(ABS_MT_SLOT, {
			minimum: 0,
			maximum: MAX_CONTACTS - 1,
		})
		dev.configureAbsoluteAxis(ABS_MT_TRACKING_ID, {
			minimum: -1,
			maximum: 0x7fffffff,
		})
		dev.configureAbsoluteAxis(ABS_MT_POSITION_X, {
			minimum: 0,
			maximum: this.config.screenWidth,
		})
		dev.configureAbsoluteAxis(ABS_MT_POSITION_Y, {
			minimum: 0,
			maximum: this.config.screenHeight,
		})
		dev.configureAbsoluteAxis(ABS_MT_TOUCH_MAJOR, { minimum: 0, maximum: 255 })
		dev.configureAbsoluteAxis(ABS_MT_PRESSURE, { minimum: 0, maximum: 255 })
		dev.configureAbsoluteAxis(ABS_X, {
			minimum: 0,
			maximum: this.config.screenWidth,
		})
		dev.configureAbsoluteAxis(ABS_Y, {
			minimum: 0,
			maximum: this.config.screenHeight,
		})

		return createDevice(dev)
	}

	private setupGamepadDevice(): UinputDevice {
		const dev = new UinputDevice({
			name: "Virtual Gamepad",
			identity: DEVICE_IDENTITY,
		})

		dev.setEventBit(EV_KEY)
		dev.setEventBit(EV_ABS)
		dev.setEventBit(EV_SYN)

		// Gamepad buttons
		for (const code of Object.values(GAMEPAD_BUTTON_MAP)) {
			dev.setKeyBit(code)
		}

		// Absolute axes
		dev.setAbsoluteBit(ABS_X)
		dev.setAbsoluteBit(ABS_Y)
		dev.setAbsoluteBit(ABS_Z)
		dev.setAbsoluteBit(ABS_RX)
		dev.setAbsoluteBit(ABS_RY)
		dev.setAbsoluteBit(ABS_RZ)
		dev.setAbsoluteBit(ABS_HAT0X)
		dev.setAbsoluteBit(ABS_HAT0Y)

		// Abs ranges
		dev.configureAbsoluteAxis(ABS_X, {
			minimum: -32767,
			maximum: 32767,
			fuzz: 16,
			flat: 128,
		})
		dev.configureAbsoluteAxis(ABS_Y, {
			minimum: -32767,
			maximum: 32767,
			fuzz: 16,
			flat: 128,
		})
		dev.configureAbsoluteAxis(ABS_Z, { minimum: 0, maximum: 255 })
		dev.configureAbsoluteAxis(ABS_RX, {
			minimum: -32767,
			maximum: 32767,
			fuzz: 16,
			flat: 128,
		})
		dev.configureAbsoluteAxis(ABS_RY, {
			minimum: -32767,
			maximum: 32767,
			fuzz: 16,
			flat: 128,
		})
		dev.configureAbsoluteAxis(ABS_RZ, { minimum: 0, maximum: 255 })
		dev.configureAbsoluteAxis(ABS_HAT0X, { minimum: -1, maximum: 1 })
		dev.configureAbsoluteAxis(ABS_HAT0Y, { minimum: -1, maximum: 1 })

		return createDevice(dev)
	}
}
