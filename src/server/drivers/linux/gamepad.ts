/**
 * Linux virtual gamepad implementation.
 *
 * Handles digital button presses, trigger states, D-pad inputs, and analog stick
 * movements through a uinput gamepad device. Translates incoming button IDs and
 * normalized stick coordinates (-1..+1) into Linux input subsystem EV_KEY and EV_ABS events.
 */
import { writeEvent } from "./structs.ts"
import {
	EV_SYN,
	EV_KEY,
	EV_ABS,
	SYN_REPORT,
	KEY_PRESS,
	KEY_RELEASE,
	BTN_A,
	BTN_B,
	BTN_X,
	BTN_Y,
	BTN_TL,
	BTN_TR,
	BTN_TL2,
	BTN_TR2,
	BTN_SELECT,
	BTN_START,
	BTN_MODE,
	BTN_THUMBL,
	BTN_THUMBR,
	BTN_DPAD_UP,
	BTN_DPAD_DOWN,
	BTN_DPAD_LEFT,
	BTN_DPAD_RIGHT,
	ABS_X,
	ABS_Y,
	ABS_Z,
	ABS_RX,
	ABS_RY,
	ABS_RZ,
	ABS_HAT0X,
	ABS_HAT0Y,
} from "./constants.ts"

export const GAMEPAD_BUTTON_MAP: Record<string, number> = {
	a: BTN_A,
	b: BTN_B,
	x: BTN_X,
	y: BTN_Y,
	lb: BTN_TL,
	rb: BTN_TR,
	lt: BTN_TL2,
	rt: BTN_TR2,
	select: BTN_SELECT,
	start: BTN_START,
	mode: BTN_MODE,
	ls: BTN_THUMBL,
	rs: BTN_THUMBR,
	"dpad-up": BTN_DPAD_UP,
	"dpad-down": BTN_DPAD_DOWN,
	"dpad-left": BTN_DPAD_LEFT,
	"dpad-right": BTN_DPAD_RIGHT,
}

const AXIS_MAX = 32767

export class LinuxGamepad {
	private fd: number

	constructor(fd: number) {
		this.fd = fd
	}

	injectGamepadButton(button: string, isDown: boolean): void {
		const lowerBtn = button.toLowerCase()
		const code = GAMEPAD_BUTTON_MAP[lowerBtn]

		if (code !== undefined) {
			writeEvent(this.fd, EV_KEY, code, isDown ? KEY_PRESS : KEY_RELEASE)
		} else {
			console.warn("[LinuxGamepad] Unknown gamepad button:", button)
		}

		// Update dual ABS values for D-Pad and triggers for max compatibility
		if (lowerBtn === "dpad-up") {
			writeEvent(this.fd, EV_ABS, ABS_HAT0Y, isDown ? -1 : 0)
		} else if (lowerBtn === "dpad-down") {
			writeEvent(this.fd, EV_ABS, ABS_HAT0Y, isDown ? 1 : 0)
		} else if (lowerBtn === "dpad-left") {
			writeEvent(this.fd, EV_ABS, ABS_HAT0X, isDown ? -1 : 0)
		} else if (lowerBtn === "dpad-right") {
			writeEvent(this.fd, EV_ABS, ABS_HAT0X, isDown ? 1 : 0)
		} else if (lowerBtn === "lt") {
			writeEvent(this.fd, EV_ABS, ABS_Z, isDown ? 255 : 0)
		} else if (lowerBtn === "rt") {
			writeEvent(this.fd, EV_ABS, ABS_RZ, isDown ? 255 : 0)
		}

		this.sync()
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		const clamp = (val: number) => Math.max(-1, Math.min(1, val))
		const normAx = clamp(ax)
		const normAy = clamp(ay)

		const intX = Math.round(normAx * AXIS_MAX)
		const intY = Math.round(normAy * AXIS_MAX)

		if (axis === "ls") {
			writeEvent(this.fd, EV_ABS, ABS_X, intX)
			writeEvent(this.fd, EV_ABS, ABS_Y, intY)
		} else if (axis === "rs") {
			writeEvent(this.fd, EV_ABS, ABS_RX, intX)
			writeEvent(this.fd, EV_ABS, ABS_RY, intY)
		}

		this.sync()
	}

	private sync(): void {
		writeEvent(this.fd, EV_SYN, SYN_REPORT, 0)
	}
}
