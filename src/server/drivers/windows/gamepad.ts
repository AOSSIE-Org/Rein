/**
 * Windows virtual gamepad implementation using ViGEmBus.
 *
 * Creates a virtual Xbox 360 controller via the ViGEmBus kernel driver and
 * ViGEmClient DLL using @imxade/inject/windows. Button presses, D-pad states,
 * and analog stick positions are written through target.update(). If ViGEmBus
 * is not installed, the constructor logs a warning and all injection calls are no-ops.
 *
 * DLL resolution (first match wins):
 *  1. Bundled `bin/vigme/Nefarius.ViGEm.Client.dll` (dev / Electron resources)
 *  2. System-installed `ViGEmClient.dll` resolved via PATH / system loader
 */
import { ViGEmClient, type ViGEmXbox360Target } from "@imxade/inject/windows"
import { resolveBundledBin } from "../../../utils/binPaths.ts"
import { BUTTON_BITS } from "./constants.ts"

const VIGEM_DLL =
	resolveBundledBin("vigme", "ViGEmClient.dll") ?? "ViGEmClient.dll"
const AXIS_MAX = 32767
const TRIGGER_MAX = 255

export class WindowsGamepad {
	private vigem: ViGEmClient | null = null
	private target: ViGEmXbox360Target | null = null
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
		try {
			this.vigem = new ViGEmClient(VIGEM_DLL)
			this.target = this.vigem.createXbox360Target()
			this.available = true
			console.log("[WindowsGamepad] Virtual Xbox 360 controller connected")
		} catch (err) {
			console.warn(
				`[WindowsGamepad] ${VIGEM_DLL} initialization failed — virtual gamepad disabled.`,
				err,
			)
			this.cleanup()
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
		this.available = false
		this.cleanup()
	}

	private cleanup(): void {
		try {
			this.target?.destroy()
			this.vigem?.destroy()
		} catch (err) {
			console.warn("[WindowsGamepad] Error during cleanup:", err)
		}
		this.target = null
		this.vigem = null
	}

	private flush(): void {
		if (!this.available || !this.target) return
		try {
			this.target.update({
				wButtons: this.wButtons & 0xffff,
				bLeftTrigger: this.bLeftTrigger & 0xff,
				bRightTrigger: this.bRightTrigger & 0xff,
				sThumbLX: this.sThumbLX,
				sThumbLY: this.sThumbLY,
				sThumbRX: this.sThumbRX,
				sThumbRY: this.sThumbRY,
			})
		} catch (err) {
			console.warn("[WindowsGamepad] Error sending report:", err)
		}
	}
}
