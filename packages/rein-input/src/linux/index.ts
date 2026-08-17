import {
	openUinput,
	closeUinput,
	writeEvent,
	ioctlInt,
	ioctlStruct,
	ioctlNull,
} from "./structs"
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
} from "./constants"
import { WHEEL_SCALE, DEFAULT_CONFIG } from "../constants"
import { LinuxKeyboard } from "./keyboard"
import { LinuxTouch } from "./touch"
import { LINUX_KEY_MAP } from "../keyMap"
import type {
	InputConfig,
	PlatformInjector,
	TouchContact,
	MouseButton,
} from "../types"

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
			ioctlNull(this.fd, UI_DEV_DESTROY)
			closeUinput(this.fd)
			this.fd = -1
		}
	}
}

export class LinuxInputInjector implements PlatformInjector {
	private config: InputConfig
	private mouseDev = new UinputDevice("Mouse")
	private kbDev = new UinputDevice("Keyboard")
	private touchDev = new UinputDevice("Touch")
	private keyboard: LinuxKeyboard | null = null
	private touch: LinuxTouch | null = null
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

	injectMouseButton(button: MouseButton, isDown: boolean): void {
		if (!this.initialized) return

		const codeMap: Record<MouseButton, number> = {
			left: BTN_LEFT,
			right: BTN_RIGHT,
			middle: BTN_MIDDLE,
		}
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
			const amount = Math.round(dy * invert * WHEEL_SCALE)
			writeEvent(fd, EV_REL, REL_WHEEL, amount)
		}
		if (dx !== 0) {
			const amount = Math.round(dx * invert * WHEEL_SCALE)
			writeEvent(fd, EV_REL, REL_HWHEEL, amount)
		}
		writeEvent(fd, EV_SYN, SYN_REPORT, 0)
	}

	injectKey(key: string, pos?: string): void {
		this.keyboard?.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard?.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard?.injectText(text)
	}

	injectTouch(contacts: TouchContact[]): void {
		this.touch?.injectTouch(contacts)
	}

	destroy(): void {
		this.touch?.releaseAll()
		this.mouseDev.destroy()
		this.kbDev.destroy()
		this.touchDev.destroy()
		this.initialized = false
	}

	private initialize(): void {
		const mouseOk = this.setupMouseDevice()
		const kbOk = this.setupKeyboardDevice()
		const touchOk = this.setupTouchDevice()

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
		this.initialized = true
		console.log("[LinuxInputInjector] All virtual devices initialized")
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

		this.touchDev.setKeybit(BTN_TOUCH)
		this.touchDev.setKeybit(BTN_TOOL_FINGER)
		this.touchDev.setKeybit(BTN_TOOL_DOUBLETAP)
		this.touchDev.setKeybit(BTN_TOOL_TRIPLETAP)
		this.touchDev.setKeybit(BTN_TOOL_QUADTAP)

		this.touchDev.setAbsbit(ABS_MT_SLOT)
		this.touchDev.setAbsbit(ABS_MT_TRACKING_ID)
		this.touchDev.setAbsbit(ABS_MT_POSITION_X)
		this.touchDev.setAbsbit(ABS_MT_POSITION_Y)
		this.touchDev.setAbsbit(ABS_MT_TOUCH_MAJOR)
		this.touchDev.setAbsbit(ABS_MT_PRESSURE)
		this.touchDev.setAbsbit(ABS_X)
		this.touchDev.setAbsbit(ABS_Y)

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
}

export { LinuxKeyboard } from "./keyboard"
export { LinuxTouch } from "./touch"
