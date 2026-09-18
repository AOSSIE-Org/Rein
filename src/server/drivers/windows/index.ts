/**
 * Windows input injection backend using the Win32 SendInput API.
 *
 * Provides mouse, keyboard, and touch input injection on Windows,
 * handling native mouse events directly while delegating keyboard
 * and touch functionality to platform-specific modules.
 */
import { SendInput, INPUT_STRUCT_SIZE } from "./structs.ts"
import {
	MOUSEEVENTF_MOVE,
	MOUSEEVENTF_LEFTDOWN,
	MOUSEEVENTF_LEFTUP,
	MOUSEEVENTF_RIGHTDOWN,
	MOUSEEVENTF_RIGHTUP,
	MOUSEEVENTF_MIDDLEDOWN,
	MOUSEEVENTF_MIDDLEUP,
	MOUSEEVENTF_WHEEL,
	MOUSEEVENTF_HWHEEL,
	WHEEL_DELTA,
} from "./constants.ts"
import { INPUT_MOUSE, DEFAULT_CONFIG } from "../../constants.ts"
import type { InputConfig, TouchContact } from "../../types.ts"
import { WindowsKeyboard } from "./keyboard.ts"
import { WindowsTouch } from "./touch.ts"
import { WindowsGamepad } from "./gamepad.ts"

if (process.platform !== "win32") {
	throw new Error("WindowsInputInjector can only be used on Windows")
}

export class WindowsInputInjector {
	private keyboard: WindowsKeyboard
	private touch: WindowsTouch
	private gamepad: WindowsGamepad
	private config: InputConfig

	constructor(config: Partial<InputConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.keyboard = new WindowsKeyboard()
		this.touch = new WindowsTouch()
		this.gamepad = new WindowsGamepad()
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

	// ---- Mouse ----
	injectMouseMove(dx: number, dy: number): void {
		if (dx === 0 && dy === 0) return
		SendInput(
			1,
			[
				{
					type: INPUT_MOUSE,
					__pad: 0,
					u: {
						mi: {
							dx: Math.round(dx),
							dy: Math.round(dy),
							mouseData: 0,
							dwFlags: MOUSEEVENTF_MOVE,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				},
			],
			INPUT_STRUCT_SIZE,
		)
	}

	injectMouseButton(
		button: "left" | "right" | "middle",
		isDown: boolean,
	): void {
		const flagMap = {
			left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
			right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
			middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
		} as const

		SendInput(
			1,
			[
				{
					type: INPUT_MOUSE,
					__pad: 0,
					u: {
						mi: {
							dx: 0,
							dy: 0,
							mouseData: 0,
							dwFlags: flagMap[button][isDown ? 0 : 1],
							time: 0,
							dwExtraInfo: 0,
						},
					},
				},
			],
			INPUT_STRUCT_SIZE,
		)
	}

	injectMouseWheel(dx: number, dy: number): void {
		const inputs: Array<Record<string, unknown>> = []

		if (dy !== 0) {
			const scrollAmount = this.config.invertScroll ? -dy : dy
			inputs.push({
				type: INPUT_MOUSE,
				__pad: 0,
				u: {
					mi: {
						dx: 0,
						dy: 0,
						mouseData: Math.round(scrollAmount * WHEEL_DELTA),
						dwFlags: MOUSEEVENTF_WHEEL,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			})
		}

		if (dx !== 0) {
			inputs.push({
				type: INPUT_MOUSE,
				__pad: 0,
				u: {
					mi: {
						dx: 0,
						dy: 0,
						mouseData: Math.round(
							(this.config.invertScroll ? dx : -dx) * WHEEL_DELTA,
						),
						dwFlags: MOUSEEVENTF_HWHEEL,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			})
		}

		if (inputs.length > 0) {
			SendInput(inputs.length, inputs, INPUT_STRUCT_SIZE)
		}
	}

	// Keyboard
	injectKey(key: string, pos?: string): void {
		this.keyboard.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard.injectText(text)
	}

	// Touch
	injectTouch(contacts: TouchContact[]): void {
		this.touch.injectTouch(contacts)
	}

	// Gamepad
	injectGamepadButton(button: string, isDown: boolean): void {
		this.gamepad.injectGamepadButton(button, isDown)
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		this.gamepad.injectGamepadAxis(axis, ax, ay)
	}

	// Cleanup
	destroy(): void {
		this.touch.destroy()
		this.gamepad.destroy()
	}
}
