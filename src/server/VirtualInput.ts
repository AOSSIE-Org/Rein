/**
 * VirtualInput — cross-platform virtual input driver for Rein
 * ===========================================================
 * Replaces NutJS by calling OS virtual-input APIs directly via koffi (FFI),
 * so the OS treats synthesised events as coming from real hardware.
 *
 * Platform support
 * ----------------
 *   Windows  – user32.dll  SendInput        (works without admin rights)
 *   Linux    – /dev/uinput kernel interface  (X11 and Wayland)
 *   macOS    – CoreGraphics  CGEventPost
 *
 * Usage (called from InputHandler):
 *   const vi = createVirtualInput()   // picks driver for current platform
 *   vi.init()                         // must be called once before any events
 *   vi.moveMouse(dx, dy)
 *   vi.scrollV(ticks)                 // positive = up, negative = down
 *   vi.scrollH(ticks)                 // positive = right, negative = left
 *   vi.leftClick()                    // full click (down + up)
 *   vi.leftDown() / vi.leftUp()       // individual press / release for drag
 *   vi.cleanup()                      // call on process exit / ws close
 */

import koffi from "koffi"
import os from "node:os"

// ─── Public interface ────────────────────────────────────────────────────────

export interface VirtualInputDriver {
	/** One-time initialisation (creates virtual device on Linux). */
	init(): void
	/** Relative mouse movement in pixels. */
	moveMouse(dx: number, dy: number): void
	/** Vertical scroll. positive = up, negative = down. */
	scrollV(ticks: number): void
	/** Horizontal scroll. positive = right, negative = left. */
	scrollH(ticks: number): void
	/** Full left mouse button click (down + up). */
	leftClick(): void
	/** Left button press (down only — for drag start). */
	leftDown(): void
	/** Left button release (up only — for drag end). */
	leftUp(): void
	/** Full right mouse button click. */
	rightClick(): void
	/** Right button press. */
	rightDown(): void
	/** Right button release. */
	rightUp(): void
	/** Full middle mouse button click. */
	middleClick(): void
	/** Middle button press. */
	middleDown(): void
	/** Middle button release. */
	middleUp(): void
	/** Release resources (destroy virtual device on Linux). */
	cleanup(): void
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createVirtualInput(): VirtualInputDriver {
	const platform = os.platform()
	if (platform === "win32") return buildWindowsDriver()
	if (platform === "linux") return buildLinuxDriver()
	if (platform === "darwin") return buildMacDriver()
	throw new Error(`VirtualInput: unsupported platform "${platform}"`)
}

// ══════════════════════════════════════════════════════════════════════════════
// Windows – user32.dll SendInput
// ══════════════════════════════════════════════════════════════════════════════

function buildWindowsDriver(): VirtualInputDriver {
	const user32 = koffi.load("user32.dll")

	// Mouse event flags (winuser.h)
	const MOUSEEVENTF_MOVE = 0x0001
	const MOUSEEVENTF_LEFTDOWN = 0x0002
	const MOUSEEVENTF_LEFTUP = 0x0004
	const MOUSEEVENTF_RIGHTDOWN = 0x0008
	const MOUSEEVENTF_RIGHTUP = 0x0010
	const MOUSEEVENTF_MIDDLEDOWN = 0x0020
	const MOUSEEVENTF_MIDDLEUP = 0x0040
	const MOUSEEVENTF_WHEEL = 0x0800
	const MOUSEEVENTF_HWHEEL = 0x1000

	// Struct definitions
	const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
		dx: "long",
		dy: "long",
		mouseData: "uint32_t",
		dwFlags: "uint32_t",
		time: "uint32_t",
		dwExtraInfo: "uintptr_t",
	})

	const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
		wVk: "uint16_t",
		wScan: "uint16_t",
		dwFlags: "uint32_t",
		time: "uint32_t",
		dwExtraInfo: "uintptr_t",
	})

	const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
		uMsg: "uint32_t",
		wParamL: "uint16_t",
		wParamH: "uint16_t",
	})

	const INPUT = koffi.struct("INPUT", {
		type: "uint32_t",
		u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
	})

	const SendInput = user32.func(
		"unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)",
	)

	const SZ = koffi.sizeof(INPUT)

	function sendMouse(flags: number, dx = 0, dy = 0, mouseData = 0) {
		SendInput(
			1,
			[
				{
					type: 0 /* INPUT_MOUSE */,
					u: {
						mi: { dx, dy, mouseData, dwFlags: flags, time: 0, dwExtraInfo: 0 },
					},
				},
			],
			SZ,
		)
	}

	return {
		init() {},
		moveMouse(dx, dy) {
			sendMouse(MOUSEEVENTF_MOVE, dx, dy)
		},
		scrollV(ticks) {
			// WHEEL_DELTA = 120; positive = forward/up
			sendMouse(MOUSEEVENTF_WHEEL, 0, 0, ticks * 120)
		},
		scrollH(ticks) {
			sendMouse(MOUSEEVENTF_HWHEEL, 0, 0, ticks * 120)
		},
		leftClick() {
			sendMouse(MOUSEEVENTF_LEFTDOWN)
			sendMouse(MOUSEEVENTF_LEFTUP)
		},
		leftDown() {
			sendMouse(MOUSEEVENTF_LEFTDOWN)
		},
		leftUp() {
			sendMouse(MOUSEEVENTF_LEFTUP)
		},
		rightClick() {
			sendMouse(MOUSEEVENTF_RIGHTDOWN)
			sendMouse(MOUSEEVENTF_RIGHTUP)
		},
		rightDown() {
			sendMouse(MOUSEEVENTF_RIGHTDOWN)
		},
		rightUp() {
			sendMouse(MOUSEEVENTF_RIGHTUP)
		},
		middleClick() {
			sendMouse(MOUSEEVENTF_MIDDLEDOWN)
			sendMouse(MOUSEEVENTF_MIDDLEUP)
		},
		middleDown() {
			sendMouse(MOUSEEVENTF_MIDDLEDOWN)
		},
		middleUp() {
			sendMouse(MOUSEEVENTF_MIDDLEUP)
		},
		cleanup() {},
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// Linux – /dev/uinput  (X11 and Wayland)
// ══════════════════════════════════════════════════════════════════════════════

function buildLinuxDriver(): VirtualInputDriver {
	const libc = koffi.load("libc.so.6")

	const input_event = koffi.struct("input_event", {
		tv_sec: "long",
		tv_usec: "long",
		type: "uint16_t",
		code: "uint16_t",
		value: "int32_t",
	})

	const uinput_setup_type = koffi.struct("uinput_setup", {
		id_bustype: "uint16_t",
		id_vendor: "uint16_t",
		id_product: "uint16_t",
		id_version: "uint16_t",
		name: koffi.array("char", 80),
		ff_effects_max: "uint32_t",
	})
	// Register the struct type so koffi resolves it in function signatures
	void uinput_setup_type

	const EVENT_SIZE = koffi.sizeof(input_event)

	const c_open = libc.func("int open(const char *path, int flags)")
	const c_close = libc.func("int close(int fd)")
	const c_ioctl_int = libc.func(
		"int ioctl(int fd, unsigned long request, int value)",
	)
	const c_ioctl_setup = libc.func(
		"int ioctl(int fd, unsigned long request, uinput_setup *arg)",
	)
	const c_write = libc.func(
		"intptr_t write(int fd, const input_event *buf, uintptr_t count)",
	)

	const O_WRONLY = 1
	const O_NONBLOCK = 2048

	// ioctl codes (linux/uinput.h)
	const UI_SET_EVBIT = 0x40045564
	const UI_SET_KEYBIT = 0x40045565
	const UI_SET_RELBIT = 0x40045566
	const UI_DEV_SETUP = 0x405c5503
	const UI_DEV_CREATE = 0x5501
	const UI_DEV_DESTROY = 0x5502

	// Event types (linux/input-event-codes.h)
	const EV_SYN = 0x00
	const EV_KEY = 0x01
	const EV_REL = 0x02

	// Relative axis codes
	const REL_X = 0x00
	const REL_Y = 0x01
	const REL_HWHEEL = 0x06
	const REL_WHEEL = 0x08

	// Button codes
	const BTN_LEFT = 0x110
	const BTN_RIGHT = 0x111
	const BTN_MIDDLE = 0x112

	let fd = -1

	function emit(type: number, code: number, value: number) {
		c_write(fd, { tv_sec: 0, tv_usec: 0, type, code, value }, EVENT_SIZE)
	}

	function syn() {
		emit(EV_SYN, 0, 0)
	}

	function btnDown(btn: number) {
		emit(EV_KEY, btn, 1)
		syn()
	}

	function btnUp(btn: number) {
		emit(EV_KEY, btn, 0)
		syn()
	}

	return {
		init() {
			fd = c_open("/dev/uinput", O_WRONLY | O_NONBLOCK)
			if (fd < 0) {
				throw new Error(
					"VirtualInput: cannot open /dev/uinput — run with sudo or add user to the 'input' group",
				)
			}

			c_ioctl_int(fd, UI_SET_EVBIT, EV_KEY)
			c_ioctl_int(fd, UI_SET_EVBIT, EV_REL)
			c_ioctl_int(fd, UI_SET_EVBIT, EV_SYN)

			for (const btn of [BTN_LEFT, BTN_RIGHT, BTN_MIDDLE]) {
				c_ioctl_int(fd, UI_SET_KEYBIT, btn)
			}
			for (const axis of [REL_X, REL_Y, REL_WHEEL, REL_HWHEEL]) {
				c_ioctl_int(fd, UI_SET_RELBIT, axis)
			}

			const nameStr = "rein-virtual-trackpad"
			const nameArr: number[] = new Array(80).fill(0)
			for (let i = 0; i < nameStr.length; i++) {
				nameArr[i] = nameStr.charCodeAt(i)
			}

			c_ioctl_setup(fd, UI_DEV_SETUP, {
				id_bustype: 0x03, // BUS_USB
				id_vendor: 0x1234,
				id_product: 0x5678,
				id_version: 1,
				name: nameArr,
				ff_effects_max: 0,
			})

			c_ioctl_int(fd, UI_DEV_CREATE, 0)
		},

		moveMouse(dx, dy) {
			emit(EV_REL, REL_X, dx)
			emit(EV_REL, REL_Y, dy)
			syn()
		},

		scrollV(ticks) {
			emit(EV_REL, REL_WHEEL, ticks)
			syn()
		},

		scrollH(ticks) {
			emit(EV_REL, REL_HWHEEL, ticks)
			syn()
		},

		leftClick() {
			btnDown(BTN_LEFT)
			btnUp(BTN_LEFT)
		},
		leftDown() {
			btnDown(BTN_LEFT)
		},
		leftUp() {
			btnUp(BTN_LEFT)
		},
		rightClick() {
			btnDown(BTN_RIGHT)
			btnUp(BTN_RIGHT)
		},
		rightDown() {
			btnDown(BTN_RIGHT)
		},
		rightUp() {
			btnUp(BTN_RIGHT)
		},
		middleClick() {
			btnDown(BTN_MIDDLE)
			btnUp(BTN_MIDDLE)
		},
		middleDown() {
			btnDown(BTN_MIDDLE)
		},
		middleUp() {
			btnUp(BTN_MIDDLE)
		},

		cleanup() {
			if (fd >= 0) {
				c_ioctl_int(fd, UI_DEV_DESTROY, 0)
				c_close(fd)
				fd = -1
			}
		},
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// macOS – CoreGraphics CGEventPost
// ══════════════════════════════════════════════════════════════════════════════

function buildMacDriver(): VirtualInputDriver {
	const cg = koffi.load(
		"/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
	)
	const cf = koffi.load(
		"/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
	)

	const CGPoint = koffi.struct("CGPoint", { x: "double", y: "double" })
	void CGPoint // registered for use in koffi function signatures

	// CGEventType (CGEventTypes.h)
	const kCGEventMouseMoved = 5
	const kCGEventLeftMouseDown = 1
	const kCGEventLeftMouseUp = 2
	const kCGEventRightMouseDown = 3
	const kCGEventRightMouseUp = 4
	const kCGEventOtherMouseDown = 25
	const kCGEventOtherMouseUp = 26
	const kCGHIDEventTap = 0
	const kCGMouseButtonLeft = 0
	const kCGMouseButtonRight = 1
	const kCGMouseButtonCenter = 2

	const CGEventSourceCreate = cg.func("void* CGEventSourceCreate(int stateID)")
	const CGEventCreate = cg.func("void* CGEventCreate(void *source)")
	const CGEventGetLocation = cg.func("CGPoint CGEventGetLocation(void *event)")
	const CGEventCreateMouseEvent = cg.func(
		"void* CGEventCreateMouseEvent(void *source, int mouseType, CGPoint mouseCursorPosition, int mouseButton)",
	)
	// wheelCount=2 lets us pass wheel1 (vertical) and wheel2 (horizontal)
	const CGEventCreateScrollWheelEvent2 = cg.func(
		"void* CGEventCreateScrollWheelEvent(void *source, int units, uint32_t wheelCount, int32_t wheel1, int32_t wheel2)",
	)
	const CGEventPost = cg.func("void CGEventPost(int tap, void *event)")
	const CFRelease = cf.func("void CFRelease(void *cf)")

	// kCGEventSourceStateHIDSystemState = 1
	const source = CGEventSourceCreate(1)

	function getPos(): { x: number; y: number } {
		const ev = CGEventCreate(null)
		const pos = CGEventGetLocation(ev) as { x: number; y: number }
		CFRelease(ev)
		return pos
	}

	function postMouse(type: number, btn: number, pos: { x: number; y: number }) {
		const ev = CGEventCreateMouseEvent(source, type, pos, btn)
		CGEventPost(kCGHIDEventTap, ev)
		CFRelease(ev)
	}

	return {
		init() {},

		moveMouse(dx, dy) {
			const pos = getPos()
			postMouse(kCGEventMouseMoved, kCGMouseButtonLeft, {
				x: pos.x + dx,
				y: pos.y + dy,
			})
		},

		scrollV(ticks) {
			// kCGScrollEventUnitLine = 1; wheel1 = vertical, wheel2 = 0
			const ev = CGEventCreateScrollWheelEvent2(source, 1, 2, ticks, 0)
			CGEventPost(kCGHIDEventTap, ev)
			CFRelease(ev)
		},

		scrollH(ticks) {
			// wheel1 = 0 (no vertical), wheel2 = horizontal delta
			const ev = CGEventCreateScrollWheelEvent2(source, 1, 2, 0, ticks)
			CGEventPost(kCGHIDEventTap, ev)
			CFRelease(ev)
		},

		leftClick() {
			const pos = getPos()
			postMouse(kCGEventLeftMouseDown, kCGMouseButtonLeft, pos)
			postMouse(kCGEventLeftMouseUp, kCGMouseButtonLeft, pos)
		},
		leftDown() {
			const pos = getPos()
			postMouse(kCGEventLeftMouseDown, kCGMouseButtonLeft, pos)
		},
		leftUp() {
			const pos = getPos()
			postMouse(kCGEventLeftMouseUp, kCGMouseButtonLeft, pos)
		},
		rightClick() {
			const pos = getPos()
			postMouse(kCGEventRightMouseDown, kCGMouseButtonRight, pos)
			postMouse(kCGEventRightMouseUp, kCGMouseButtonRight, pos)
		},
		rightDown() {
			const pos = getPos()
			postMouse(kCGEventRightMouseDown, kCGMouseButtonRight, pos)
		},
		rightUp() {
			const pos = getPos()
			postMouse(kCGEventRightMouseUp, kCGMouseButtonRight, pos)
		},
		middleClick() {
			const pos = getPos()
			postMouse(kCGEventOtherMouseDown, kCGMouseButtonCenter, pos)
			postMouse(kCGEventOtherMouseUp, kCGMouseButtonCenter, pos)
		},
		middleDown() {
			const pos = getPos()
			postMouse(kCGEventOtherMouseDown, kCGMouseButtonCenter, pos)
		},
		middleUp() {
			const pos = getPos()
			postMouse(kCGEventOtherMouseUp, kCGMouseButtonCenter, pos)
		},

		cleanup() {
			if (source) CFRelease(source)
		},
	}
}
