import * as fs from "node:fs/promises"
import * as fsSync from "node:fs"

const UINPUT_PATH = "/dev/uinput"

interface VirtualInputConfig {
	name: string
	vendorId?: number
	productId?: number
	version?: number
}

const EV_KEY = 0x01
const EV_REL = 0x02
const EV_ABS = 0x03
const EV_SYN = 0x00

const REL_X = 0x00
const REL_Y = 0x01
const REL_WHEEL = 0x08
const REL_HWHEEL = 0x06

const BTN_LEFT = 0x110
const BTN_RIGHT = 0x111
const BTN_MIDDLE = 0x112

const KEY_UNKNOWN = 0x00
const KEY_SPACE = 0x39
const KEY_ENTER = 0x1c
const KEY_TAB = 0x0f
const KEY_BACKSPACE = 0x0e
const KEY_ESC = 0x01
const KEY_DELETE = 0x4f
const KEY_INSERT = 0x4b
const KEY_HOME = 0x4e
const KEY_END = 0x4d
const KEY_PAGEUP = 0x49
const KEY_PAGEDOWN = 0x4a
const KEY_UP = 0x48
const KEY_DOWN = 0x50
const KEY_LEFT = 0x4b
const KEY_RIGHT = 0x4d
const KEY_F1 = 0x3b
const KEY_F2 = 0x3c
const KEY_F3 = 0x3d
const KEY_F4 = 0x3e
const KEY_F5 = 0x3f
const KEY_F6 = 0x40
const KEY_F7 = 0x41
const KEY_F8 = 0x42
const KEY_F9 = 0x43
const KEY_F10 = 0x44
const KEY_F11 = 0x57
const KEY_F12 = 0x58
const KEY_LEFTSHIFT = 0x2a
const KEY_RIGHTSHIFT = 0x36
const KEY_LEFTCTRL = 0x1d
const KEY_RIGHTCTRL = 0x1d
const KEY_LEFTALT = 0x38
const KEY_RIGHTALT = 0x38
const KEY_LEFTMETA = 0x5b
const KEY_RIGHTMETA = 0x5c

const KEY_A = 0x1e
const KEY_B = 0x32
const KEY_C = 0x33
const KEY_D = 0x20
const KEY_E = 0x12
const KEY_F = 0x21
const KEY_G = 0x22
const KEY_H = 0x23
const KEY_I = 0x17
const KEY_J = 0x24
const KEY_K = 0x25
const KEY_L = 0x26
const KEY_M = 0x34
const KEY_N = 0x31
const KEY_O = 0x18
const KEY_P = 0x19
const KEY_Q = 0x10
const KEY_R = 0x13
const KEY_S = 0x1f
const KEY_T = 0x14
const KEY_U = 0x16
const KEY_V = 0x2f
const KEY_W = 0x11
const KEY_X = 0x2d
const KEY_Y = 0x15
const KEY_Z = 0x2c

const KEY_0 = 0x0b
const KEY_1 = 0x02
const KEY_2 = 0x03
const KEY_3 = 0x04
const KEY_4 = 0x05
const KEY_5 = 0x06
const KEY_6 = 0x07
const KEY_7 = 0x08
const KEY_8 = 0x09
const KEY_9 = 0x0a

const KEY_MINUS = 0x0c
const KEY_EQUAL = 0x0d
const KEY_LEFTBRACE = 0x1a
const KEY_RIGHTBRACE = 0x1b
const KEY_BACKSLASH = 0x2b
const KEY_SEMICOLON = 0x27
const KEY_QUOTE = 0x28
const KEY_COMMA = 0x32
const KEY_DOT = 0x34
const KEY_SLASH = 0x35
const KEY_GRAVE = 0x29

const KEY_CAPSLOCK = 0x3a
const KEY_NUMLOCK = 0x45
const KEY_SCROLLLOCK = 0x46

const KEY_KP0 = 0x52
const KEY_KP1 = 0x4f
const KEY_KP2 = 0x50
const KEY_KP3 = 0x51
const KEY_KP4 = 0x4b
const KEY_KP5 = 0x4c
const KEY_KP6 = 0x4d
const KEY_KP7 = 0x47
const KEY_KP8 = 0x48
const KEY_KP9 = 0x49
const KEY_KPMINUS = 0x4a
const KEY_KPPLUS = 0x4e
const KEY_KPDOT = 0x53
const KEY_KPENTER = 0x5c

const ui_user_dev = (name: string) => {
	const nameBytes = Buffer.from(name.padEnd(80, "\0").slice(0, 80))
	return Buffer.alloc(4 + 4 + 4 + 4 + 80)
}

const createUinputDevice = async (
	fd: number,
	config: VirtualInputConfig,
): Promise<void> => {
	const buffer = Buffer.alloc(4 + 4 + 4 + 4 + 80)
	buffer.writeUInt16LE(config.vendorId ?? 0x1234, 0)
	buffer.writeUInt16LE(config.productId ?? 0x5678, 2)
	buffer.writeUInt16LE(config.version ?? 1, 4)
	const nameBuffer = Buffer.from(`${config.name.slice(0, 79)}\0`)
	nameBuffer.copy(buffer, 8)
	fsSync.writeSync(fd, buffer)
}

const setupMouseEvents = async (fd: number): Promise<void> => {
	const events = [
		[EV_KEY, BTN_LEFT],
		[EV_KEY, BTN_RIGHT],
		[EV_KEY, BTN_MIDDLE],
		[EV_REL, REL_X],
		[EV_REL, REL_Y],
		[EV_REL, REL_WHEEL],
		[EV_REL, REL_HWHEEL],
		[EV_SYN, 0],
	]
	for (const [type, code] of events) {
		const buffer = Buffer.alloc(8)
		buffer.writeUInt16LE(type, 0)
		buffer.writeUInt16LE(code, 2)
		fsSync.writeSync(fd, buffer)
	}
}

const setupKeyboardEvents = async (fd: number): Promise<void> => {
	const keys = [
		KEY_UNKNOWN,
		KEY_ESC,
		KEY_1,
		KEY_2,
		KEY_3,
		KEY_4,
		KEY_5,
		KEY_6,
		KEY_7,
		KEY_8,
		KEY_9,
		KEY_0,
		KEY_MINUS,
		KEY_EQUAL,
		KEY_BACKSPACE,
		KEY_TAB,
		KEY_Q,
		KEY_W,
		KEY_E,
		KEY_R,
		KEY_T,
		KEY_Y,
		KEY_U,
		KEY_I,
		KEY_O,
		KEY_P,
		KEY_LEFTBRACE,
		KEY_RIGHTBRACE,
		KEY_ENTER,
		KEY_LEFTCTRL,
		KEY_A,
		KEY_S,
		KEY_D,
		KEY_F,
		KEY_G,
		KEY_H,
		KEY_J,
		KEY_K,
		KEY_L,
		KEY_SEMICOLON,
		KEY_QUOTE,
		KEY_GRAVE,
		KEY_LEFTSHIFT,
		KEY_BACKSLASH,
		KEY_Z,
		KEY_X,
		KEY_C,
		KEY_V,
		KEY_B,
		KEY_N,
		KEY_M,
		KEY_COMMA,
		KEY_DOT,
		KEY_SLASH,
		KEY_RIGHTSHIFT,
		KEY_KPMULT,
		KEY_LEFTALT,
		KEY_SPACE,
		KEY_CAPSLOCK,
		KEY_F1,
		KEY_F2,
		KEY_F3,
		KEY_F4,
		KEY_F5,
		KEY_F6,
		KEY_F7,
		KEY_F8,
		KEY_F9,
		KEY_F10,
		KEY_F11,
		KEY_F12,
		KEY_NUMLOCK,
		KEY_SCROLLLOCK,
		KEY_KP7,
		KEY_KP8,
		KEY_KP9,
		KEY_KPMINUS,
		KEY_KP4,
		KEY_KP5,
		KEY_KP6,
		KEY_KPPLUS,
		KEY_KP1,
		KEY_KP2,
		KEY_KP3,
		KEY_KP0,
		KEY_KPDOT,
		KEY_KPENTER,
		KEY_RIGHTCTRL,
		KEY_KPDIV,
		KEY_KP0,
		KEY_KP0,
		KEY_RIGHTALT,
		KEY_HOME,
		KEY_UP,
		KEY_PAGEUP,
		KEY_LEFT,
		KEY_RIGHT,
		KEY_END,
		KEY_DOWN,
		KEY_PAGEDOWN,
		KEY_INSERT,
		KEY_DELETE,
		KEY_LEFTMETA,
		KEY_RIGHTMETA,
	]
	for (const code of keys) {
		const buffer = Buffer.alloc(8)
		buffer.writeUInt16LE(EV_KEY, 0)
		buffer.writeUInt16LE(code, 2)
		fsSync.writeSync(fd, buffer)
	}
	const syncBuffer = Buffer.alloc(8)
	syncBuffer.writeUInt16LE(EV_SYN, 0)
	fsSync.writeSync(fd, syncBuffer)
}

const KEY_MAP: Record<string, number> = {
	escape: KEY_ESC,
	"`": KEY_GRAVE,
	"1": KEY_1,
	"2": KEY_2,
	"3": KEY_3,
	"4": KEY_4,
	"5": KEY_5,
	"6": KEY_6,
	"7": KEY_7,
	"8": KEY_8,
	"9": KEY_9,
	"0": KEY_0,
	"-": KEY_MINUS,
	"=": KEY_EQUAL,
	backspace: KEY_BACKSPACE,
	tab: KEY_TAB,
	q: KEY_Q,
	w: KEY_W,
	e: KEY_E,
	r: KEY_R,
	t: KEY_T,
	y: KEY_Y,
	u: KEY_U,
	i: KEY_I,
	o: KEY_O,
	p: KEY_P,
	"[": KEY_LEFTBRACE,
	"]": KEY_RIGHTBRACE,
	enter: KEY_ENTER,
	control: KEY_LEFTCTRL,
	a: KEY_A,
	s: KEY_S,
	d: KEY_D,
	f: KEY_F,
	g: KEY_G,
	h: KEY_H,
	j: KEY_J,
	k: KEY_K,
	l: KEY_L,
	";": KEY_SEMICOLON,
	"'": KEY_QUOTE,
	"\\": KEY_BACKSLASH,
	shift: KEY_LEFTSHIFT,
	z: KEY_Z,
	x: KEY_X,
	c: KEY_C,
	v: KEY_V,
	b: KEY_B,
	n: KEY_N,
	m: KEY_M,
	",": KEY_COMMA,
	".": KEY_DOT,
	"/": KEY_SLASH,
	alt: KEY_LEFTALT,
	" ": KEY_SPACE,
	capslock: KEY_CAPSLOCK,
	f1: KEY_F1,
	f2: KEY_F2,
	f3: KEY_F3,
	f4: KEY_F4,
	f5: KEY_F5,
	f6: KEY_F6,
	f7: KEY_F7,
	f8: KEY_F8,
	f9: KEY_F9,
	f10: KEY_F10,
	f11: KEY_F11,
	f12: KEY_F12,
	numlock: KEY_NUMLOCK,
	scrolllock: KEY_SCROLLLOCK,
	home: KEY_HOME,
	end: KEY_END,
	pageup: KEY_PAGEUP,
	pagedown: KEY_PAGEDOWN,
	insert: KEY_INSERT,
	delete: KEY_DELETE,
	arrowup: KEY_UP,
	arrowdown: KEY_DOWN,
	arrowleft: KEY_LEFT,
	arrowright: KEY_RIGHT,
	meta: KEY_LEFTMETA,
}

let isUinputAvailable: boolean | null = null
let deviceFd: number | null = null
let lastFailureTime = 0
const COOLDOWN_MS = 5000

const UINPUT_DEVICE_NAME = "rein-virtual-input"

export async function checkUinput(): Promise<boolean> {
	if (isUinputAvailable !== null) {
		return isUinputAvailable
	}

	const now = Date.now()
	if (now - lastFailureTime < COOLDOWN_MS) {
		return false
	}

	try {
		await fs.access(UINPUT_PATH)
		isUinputAvailable = true
		console.log("[uinput] /dev/uinput is available")
		return true
	} catch {
		isUinputAvailable = false
		lastFailureTime = now
		console.warn("[uinput] /dev/uinput is not available")
		return false
	}
}

async function initUinputDevice(): Promise<boolean> {
	if (deviceFd !== null) {
		return true
	}

	if (!(await checkUinput())) {
		return false
	}

	try {
		const fd = fsSync.open(UINPUT_PATH, fsSync.O_WRONLY).fd
		if (fd === undefined) {
			return false
		}
		deviceFd = fd

		await createUinputDevice(deviceFd, {
			name: UINPUT_DEVICE_NAME,
		})

		await setupMouseEvents(deviceFd)
		await setupKeyboardEvents(deviceFd)

		const ioctlEnable = Buffer.alloc(4)
		ioctlEnable.writeUInt16LE(0x40, 0)
		ioctlEnable.writeUInt8(0x03, 2)
		ioctlEnable.writeUInt8(0x00, 3)

		try {
			fsSync.writeSync(deviceFd, Buffer.from([0x40, 0x03, 0x00, 0x00]))
		} catch {
			console.log("[uinput] ioctl skipped (may not be needed)")
		}

		console.log("[uinput] Virtual input device created")
		return true
	} catch (err) {
		console.error("[uinput] Failed to initialize device:", err)
		if (deviceFd !== null) {
			try {
				fsSync.close(deviceFd)
			} catch {
				// Ignore close errors
			}
			deviceFd = null
		}
		lastFailureTime = Date.now()
		return false
	}
}

const sendEvent = (type: number, code: number, value: number): void => {
	if (deviceFd === null) return
	const buffer = Buffer.alloc(16)
	buffer.writeUInt16LE(type, 0)
	buffer.writeUInt16LE(code, 2)
	buffer.writeInt32LE(value, 4)
	fsSync.writeSync(deviceFd, buffer)
}

const sendSync = (): void => {
	sendEvent(EV_SYN, 0, 0)
}

export async function moveRelative(dx: number, dy: number): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	try {
		if (dx !== 0) {
			sendEvent(EV_REL, REL_X, Math.round(dx))
		}
		if (dy !== 0) {
			sendEvent(EV_REL, REL_Y, Math.round(dy))
		}
		sendSync()
		return true
	} catch (err) {
		console.error("[uinput] Error in moveRelative:", err)
		isUinputAvailable = null
		lastFailureTime = Date.now()
		return false
	}
}

export async function pressButton(
	button: "left" | "right" | "middle",
	press: boolean,
): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	const btnCode =
		button === "left" ? BTN_LEFT : button === "right" ? BTN_RIGHT : BTN_MIDDLE

	try {
		sendEvent(EV_KEY, btnCode, press ? 1 : 0)
		sendSync()
		return true
	} catch (err) {
		console.error("[uinput] Error in pressButton:", err)
		return false
	}
}

export async function scroll(dx: number, dy: number): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	try {
		if (dy !== 0) {
			sendEvent(EV_REL, REL_WHEEL, Math.round(dy))
		}
		if (dx !== 0) {
			sendEvent(EV_REL, REL_HWHEEL, Math.round(dx))
		}
		sendSync()
		return true
	} catch (err) {
		console.error("[uinput] Error in scroll:", err)
		return false
	}
}

export async function pressKey(key: string): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	const keyCode = KEY_MAP[key.toLowerCase()]

	if (keyCode === undefined) {
		console.warn(`[uinput] Unknown key: ${key}`)
		return false
	}

	try {
		sendEvent(EV_KEY, keyCode, 1)
		sendSync()
		return true
	} catch (err) {
		console.error("[uinput] Error in pressKey:", err)
		return false
	}
}

export async function releaseKey(key: string): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	const keyCode = KEY_MAP[key.toLowerCase()]

	if (keyCode === undefined) {
		return false
	}

	try {
		sendEvent(EV_KEY, keyCode, 0)
		sendSync()
		return true
	} catch (err) {
		console.error("[uinput] Error in releaseKey:", err)
		return false
	}
}

export async function typeText(text: string): Promise<boolean> {
	if (!(await initUinputDevice())) {
		return false
	}

	try {
		for (const char of text) {
			const code = char.charCodeAt(0)

			if (code >= 32 && code <= 126) {
				sendEvent(EV_KEY, code, 1)
				sendSync()
				await new Promise((r) => setTimeout(r, 5))
				sendEvent(EV_KEY, code, 0)
				sendSync()
				await new Promise((r) => setTimeout(r, 5))
			}
		}
		return true
	} catch (err) {
		console.error("[uinput] Error in typeText:", err)
		return false
	}
}

export async function cleanupUinput(): Promise<void> {
	if (deviceFd !== null) {
		try {
			fsSync.close(deviceFd)
			deviceFd = null
			console.log("[uinput] Device cleaned up")
		} catch (err) {
			console.error("[uinput] Error during cleanup:", err)
		}
	}
}
