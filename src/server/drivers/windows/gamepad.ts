/**
 * Windows virtual gamepad implementation using ViGEmBus.
 *
 * Creates a virtual Xbox 360 controller via the ViGEmBus kernel driver and
 * ViGEmClient.dll. Button presses, D-pad states, and analog stick positions
 * are written through vigem_target_x360_update(). If ViGEmBus is not installed
 * the constructor logs a warning and all injection calls are no-ops.
 */
import koffi from "koffi"
import { BUTTON_BITS } from "./constants"
const AXIS_MAX = 32767
const TRIGGER_MAX = 255

// XUSB_REPORT layout: wButtons(u16), bLeftTrigger(u8), bRightTrigger(u8),
//                     sThumbLX(i16), sThumbLY(i16), sThumbRX(i16), sThumbRY(i16)
// Registered with koffi so the type name "XUSB_REPORT" resolves in the
// vigem_target_x360_update() function signature below (passed by value).
const _XusbReport = koffi.struct("XUSB_REPORT", {
	wButtons: "uint16",
	bLeftTrigger: "uint8",
	bRightTrigger: "uint8",
	sThumbLX: "int16",
	sThumbLY: "int16",
	sThumbRX: "int16",
	sThumbRY: "int16",
})

type KoffiLib = ReturnType<typeof koffi.load>
type KoffiFunc = ReturnType<KoffiLib["func"]>

let _vigem: KoffiLib | null = null
let _vigem_alloc: KoffiFunc | null = null
let _vigem_connect: KoffiFunc | null = null
let _vigem_target_x360_alloc: KoffiFunc | null = null
let _vigem_target_add: KoffiFunc | null = null
let _vigem_target_remove: KoffiFunc | null = null
let _vigem_target_x360_update: KoffiFunc | null = null
let _vigem_free: KoffiFunc | null = null

function loadViGEm(): boolean {
	if (_vigem) return true
	try {
		_vigem = koffi.load("ViGEmClient.dll")
		_vigem_alloc = _vigem.func("void * vigem_alloc()")
		_vigem_connect = _vigem.func("int vigem_connect(void *client)")
		_vigem_target_x360_alloc = _vigem.func("void * vigem_target_x360_alloc()")
		_vigem_target_add = _vigem.func(
			"int vigem_target_add(void *client, void *target)",
		)
		_vigem_target_remove = _vigem.func(
			"int vigem_target_remove(void *client, void *target)",
		)
		_vigem_target_x360_update = _vigem.func(
			"int vigem_target_x360_update(void *client, void *target, XUSB_REPORT report)",
		)
		_vigem_free = _vigem.func("void vigem_free(void *client)")
		return true
	} catch {
		console.warn(
			"[WindowsGamepad] ViGEmClient.dll not found — virtual gamepad disabled. " +
				"Install ViGEmBus from https://github.com/nefarius/ViGEmBus/releases",
		)
		return false
	}
}

export class WindowsGamepad {
	private client: unknown = null
	private target: unknown = null
	private available = false

	// Current report state — mutated in place and flushed on every change
	private wButtons = 0
	private bLeftTrigger = 0
	private bRightTrigger = 0
	private sThumbLX = 0
	private sThumbLY = 0
	private sThumbRX = 0
	private sThumbRY = 0

	constructor() {
		if (!loadViGEm()) return

		try {
			this.client = _vigem_alloc?.()
			if (!this.client) {
				console.warn("[WindowsGamepad] vigem_alloc() returned null")
				return
			}

			const connectResult = _vigem_connect?.(this.client) as number
			if (connectResult !== 0) {
				console.warn(
					`[WindowsGamepad] vigem_connect() failed (err=${connectResult}) — is ViGEmBus installed?`,
				)
				return
			}

			this.target = _vigem_target_x360_alloc?.()
			if (!this.target) {
				console.warn("[WindowsGamepad] vigem_target_x360_alloc() returned null")
				return
			}

			const addResult = _vigem_target_add?.(this.client, this.target) as number
			if (addResult !== 0) {
				console.warn(
					`[WindowsGamepad] vigem_target_add() failed (err=${addResult})`,
				)
				return
			}

			this.available = true
			console.log("[WindowsGamepad] Virtual Xbox 360 controller connected")
		} catch (err) {
			console.warn("[WindowsGamepad] Initialization error:", err)
		}
	}

	injectGamepadButton(button: string, isDown: boolean): void {
		if (!this.available) return
		const lowerBtn = button.toLowerCase()

		const bit = BUTTON_BITS[lowerBtn]
		if (bit !== undefined) {
			if (isDown) {
				this.wButtons |= bit
			} else {
				this.wButtons &= ~bit
			}
		} else if (lowerBtn === "lt") {
			this.bLeftTrigger = isDown ? TRIGGER_MAX : 0
		} else if (lowerBtn === "rt") {
			this.bRightTrigger = isDown ? TRIGGER_MAX : 0
		} else {
			console.warn("[WindowsGamepad] Unknown gamepad button:", button)
			return
		}

		this.flush()
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		if (!this.available) return
		const clamp = (v: number) => Math.max(-1, Math.min(1, v))

		// XInput Y axis: +32767 = up, so invert ay
		const intX = Math.round(clamp(ax) * AXIS_MAX)
		const intY = Math.round(-clamp(ay) * AXIS_MAX)

		if (axis === "ls") {
			this.sThumbLX = intX
			this.sThumbLY = intY
		} else {
			this.sThumbRX = intX
			this.sThumbRY = intY
		}

		this.flush()
	}

	destroy(): void {
		if (!this.available) return
		try {
			if (this.target && this.client) {
				_vigem_target_remove?.(this.client, this.target)
			}
			if (this.client) {
				_vigem_free?.(this.client)
			}
		} catch (err) {
			console.warn("[WindowsGamepad] Error during cleanup:", err)
		}
		this.client = null
		this.target = null
		this.available = false
	}

	private flush(): void {
		if (!this.available || !this.client || !this.target) return
		try {
			const report = {
				wButtons: this.wButtons & 0xffff,
				bLeftTrigger: this.bLeftTrigger & 0xff,
				bRightTrigger: this.bRightTrigger & 0xff,
				sThumbLX: this.sThumbLX,
				sThumbLY: this.sThumbLY,
				sThumbRX: this.sThumbRX,
				sThumbRY: this.sThumbRY,
			}
			_vigem_target_x360_update?.(this.client, this.target, report)
		} catch (err) {
			console.warn("[WindowsGamepad] Error sending report:", err)
		}
	}
}
