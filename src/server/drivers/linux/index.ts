/**
 * Linux uinput-based input injection implementation.
 *
 * Creates and manages virtual mouse, keyboard, and touch devices,
 * providing a unified interface for injecting input events. Handles
 * device initialization, capability registration, event injection,
 * and cleanup while delegating keyboard and touch logic to their
 * respective platform-specific modules.
 */
import {
	openUinput,
	closeUinput,
	writeEvent,
	ioctlInt,
	ioctlStruct,
	ioctlNull,
} from "./structs.ts"
import {
	EV_SYN,
	EV_KEY,
	EV_REL,
	EV_ABS,
	SYN_REPORT,
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
	UI_SET_EVBIT,
	UI_SET_KEYBIT,
	UI_SET_RELBIT,
	UI_SET_ABSBIT,
	UI_DEV_SETUP,
	UI_ABS_SETUP,
	UI_DEV_CREATE,
	UI_DEV_DESTROY,
	UINPUT_PATH,
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

class UinputDevice {
	fd = -1
	private name: string

	constructor(name: string) {
		this.name = name
	}

	open(): boolean {
		try {
			const fd = openUinput(UINPUT_PATH)
			this.fd = fd
			return true
		} catch (err) {
			console.error(`[${this.name}] Failed to open ${UINPUT_PATH}:`, err)
			console.error(
				`[${this.name}] Ensure /dev/uinput exists and the process has write permission.`,
			)
			return false
		}
	}

	create(deviceName: string): boolean {
		// Build null-padded name buffer (80 bytes)
		const nameBuf = new Array(80).fill(0)
		for (let i = 0; i < Math.min(deviceName.length, 79); i++) {
			nameBuf[i] = deviceName.charCodeAt(i)
		}

		const setup = {
			bustype: BUS_USB,
			vendor: 0x1234,
			product: 0x5678,
			version: 1,
			name: nameBuf,
			ff_effects_max: 0,
		}

		const ret = ioctlStruct(this.fd, UI_DEV_SETUP, "uinput_setup *", setup)
		if (ret < 0) {
			console.error(`[${this.name}] UI_DEV_SETUP failed (ret=${ret})`)
			return false
		}

		const createRet = ioctlNull(this.fd, UI_DEV_CREATE)
		if (createRet < 0) {
			console.error(`[${this.name}] UI_DEV_CREATE failed (ret=${createRet})`)
			return false
		}
		return true
	}

	setEvbit(bit: number): void {
		ioctlInt(this.fd, UI_SET_EVBIT, bit)
	}
	setKeybit(bit: number): void {
		ioctlInt(this.fd, UI_SET_KEYBIT, bit)
	}
	setRelbit(bit: number): void {
		ioctlInt(this.fd, UI_SET_RELBIT, bit)
	}
	setAbsbit(bit: number): void {
		ioctlInt(this.fd, UI_SET_ABSBIT, bit)
	}

	setupAbs(code: number, min: number, max: number, fuzz = 0, flat = 0): void {
		const setup = {
			code,
			__pad: 0,
			__pad2: 0,
			absinfo: {
				value: 0,
				minimum: min,
				maximum: max,
				fuzz,
				flat,
				resolution: 0,
			},
		}
		ioctlStruct(this.fd, UI_ABS_SETUP, "uinput_abs_setup *", setup)
	}

	destroy(): void {
		if (this.fd >= 0) {
			try {
				ioctlNull(this.fd, UI_DEV_DESTROY)
			} catch {}
			try {
				closeUinput(this.fd)
			} catch {}
			this.fd = -1
		}
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
	private mouseDev = new UinputDevice("Mouse")
	private kbDev = new UinputDevice("Keyboard")
	private touchDev = new UinputDevice("Touch")
	private gamepadDev = new UinputDevice("Gamepad")
	private keyboard: LinuxKeyboard | null = null
	private touch: LinuxTouch | null = null
	private gamepad: LinuxGamepad | null = null
	private initialized = false

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
		const fd = this.mouseDev.fd

		writeEvent(fd, EV_REL, REL_X, Math.round(dx))
		writeEvent(fd, EV_REL, REL_Y, Math.round(dy))
		writeEvent(fd, EV_SYN, SYN_REPORT, 0)
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
		const fd = this.mouseDev.fd

		writeEvent(fd, EV_KEY, code, isDown ? KEY_PRESS : KEY_RELEASE)
		writeEvent(fd, EV_SYN, SYN_REPORT, 0)
	}

	injectMouseWheel(dx: number, dy: number): void {
		if (!this.initialized) return

		const fd = this.mouseDev.fd
		const invert = this.config.invertScroll ? -1 : 1

		if (dy !== 0) {
			// Positive dy = scroll down on trackpad
			const amount = Math.round(dy * invert * WHEEL_SCALE)
			writeEvent(fd, EV_REL, REL_WHEEL, amount)
		}
		if (dx !== 0) {
			const amount = Math.round(dx * invert * WHEEL_SCALE)
			writeEvent(fd, EV_REL, REL_HWHEEL, amount)
		}
		writeEvent(fd, EV_SYN, SYN_REPORT, 0)
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
		this.touch?.releaseAll()
		this.mouseDev.destroy()
		this.kbDev.destroy()
		this.touchDev.destroy()
		this.gamepadDev.destroy()
		this.initialized = false
	}

	// helpers
	private initialize(): void {
		const mouseOk = this.setupMouseDevice()
		const kbOk = mouseOk ? this.setupKeyboardDevice() : false
		const touchOk = kbOk ? this.setupTouchDevice() : false

		if (!mouseOk || !kbOk || !touchOk) {
			const msg =
				"One or more virtual uinput devices failed to initialize (check /dev/uinput permissions)"
			console.error(`[LinuxInputInjector] ${msg}`)
			this.destroy()
			this.initialized = false
			throw new Error(msg)
		}

		this.keyboard = new LinuxKeyboard(this.kbDev.fd)
		this.touch = new LinuxTouch(this.touchDev.fd)

		// Gamepad is best-effort — failure does not block core mouse/keyboard/touch input
		const gamepadOk = this.setupGamepadDevice()
		if (gamepadOk) {
			this.gamepad = new LinuxGamepad(this.gamepadDev.fd)
		} else {
			console.warn(
				"[LinuxInputInjector] Virtual Gamepad device failed to initialize — gamepad injection disabled",
			)
		}

		this.initialized = true
		console.log(
			`[LinuxInputInjector] Virtual devices initialized (gamepad: ${gamepadOk ? "ok" : "unavailable"})`,
		)
	}

	private setupMouseDevice(): boolean {
		if (!this.mouseDev.open()) return false
		this.mouseDev.setEvbit(EV_KEY)
		this.mouseDev.setEvbit(EV_REL)
		this.mouseDev.setEvbit(EV_SYN)

		this.mouseDev.setKeybit(BTN_LEFT)
		this.mouseDev.setKeybit(BTN_RIGHT)
		this.mouseDev.setKeybit(BTN_MIDDLE)

		this.mouseDev.setRelbit(REL_X)
		this.mouseDev.setRelbit(REL_Y)
		this.mouseDev.setRelbit(REL_WHEEL)
		this.mouseDev.setRelbit(REL_HWHEEL)

		return this.mouseDev.create("Virtual Mouse")
	}

	private setupKeyboardDevice(): boolean {
		if (!this.kbDev.open()) return false

		this.kbDev.setEvbit(EV_KEY)
		this.kbDev.setEvbit(EV_SYN)

		// Register all key codes upfront
		for (const code of Object.values(LINUX_KEY_MAP)) {
			this.kbDev.setKeybit(code)
		}

		return this.kbDev.create("Virtual Keyboard")
	}

	private setupTouchDevice(): boolean {
		if (!this.touchDev.open()) return false

		this.touchDev.setEvbit(EV_ABS)
		this.touchDev.setEvbit(EV_KEY)
		this.touchDev.setEvbit(EV_SYN)

		// Touch buttons
		this.touchDev.setKeybit(BTN_TOUCH)
		this.touchDev.setKeybit(BTN_TOOL_FINGER)
		this.touchDev.setKeybit(BTN_TOOL_DOUBLETAP)
		this.touchDev.setKeybit(BTN_TOOL_TRIPLETAP)
		this.touchDev.setKeybit(BTN_TOOL_QUADTAP)

		// Absolute axes
		this.touchDev.setAbsbit(ABS_MT_SLOT)
		this.touchDev.setAbsbit(ABS_MT_TRACKING_ID)
		this.touchDev.setAbsbit(ABS_MT_POSITION_X)
		this.touchDev.setAbsbit(ABS_MT_POSITION_Y)
		this.touchDev.setAbsbit(ABS_MT_TOUCH_MAJOR)
		this.touchDev.setAbsbit(ABS_MT_PRESSURE)
		this.touchDev.setAbsbit(ABS_X)
		this.touchDev.setAbsbit(ABS_Y)

		// Abs ranges
		this.touchDev.setupAbs(ABS_MT_SLOT, 0, MAX_CONTACTS - 1)
		this.touchDev.setupAbs(ABS_MT_TRACKING_ID, -1, 0x7fffffff)
		this.touchDev.setupAbs(ABS_MT_POSITION_X, 0, this.config.screenWidth)
		this.touchDev.setupAbs(ABS_MT_POSITION_Y, 0, this.config.screenHeight)
		this.touchDev.setupAbs(ABS_MT_TOUCH_MAJOR, 0, 255)
		this.touchDev.setupAbs(ABS_MT_PRESSURE, 0, 255)
		this.touchDev.setupAbs(ABS_X, 0, this.config.screenWidth)
		this.touchDev.setupAbs(ABS_Y, 0, this.config.screenHeight)

		return this.touchDev.create("Virtual Touchpad")
	}

	private setupGamepadDevice(): boolean {
		if (!this.gamepadDev.open()) return false

		this.gamepadDev.setEvbit(EV_KEY)
		this.gamepadDev.setEvbit(EV_ABS)
		this.gamepadDev.setEvbit(EV_SYN)

		// Gamepad buttons
		for (const code of Object.values(GAMEPAD_BUTTON_MAP)) {
			this.gamepadDev.setKeybit(code)
		}

		// Absolute axes
		this.gamepadDev.setAbsbit(ABS_X)
		this.gamepadDev.setAbsbit(ABS_Y)
		this.gamepadDev.setAbsbit(ABS_Z)
		this.gamepadDev.setAbsbit(ABS_RX)
		this.gamepadDev.setAbsbit(ABS_RY)
		this.gamepadDev.setAbsbit(ABS_RZ)
		this.gamepadDev.setAbsbit(ABS_HAT0X)
		this.gamepadDev.setAbsbit(ABS_HAT0Y)

		// Abs ranges
		this.gamepadDev.setupAbs(ABS_X, -32767, 32767, 16, 128)
		this.gamepadDev.setupAbs(ABS_Y, -32767, 32767, 16, 128)
		this.gamepadDev.setupAbs(ABS_Z, 0, 255)
		this.gamepadDev.setupAbs(ABS_RX, -32767, 32767, 16, 128)
		this.gamepadDev.setupAbs(ABS_RY, -32767, 32767, 16, 128)
		this.gamepadDev.setupAbs(ABS_RZ, 0, 255)
		this.gamepadDev.setupAbs(ABS_HAT0X, -1, 1)
		this.gamepadDev.setupAbs(ABS_HAT0Y, -1, 1)

		return this.gamepadDev.create("Virtual Gamepad")
	}
}
