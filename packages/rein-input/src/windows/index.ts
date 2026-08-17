import { SendInput, INPUT_STRUCT_SIZE } from "./structs"
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
} from "./constants"
import { INPUT_MOUSE, DEFAULT_CONFIG } from "../constants"
import type {
	InputConfig,
	PlatformInjector,
	TouchContact,
	MouseButton,
} from "../types"
import { WindowsKeyboard } from "./keyboard"
import { WindowsTouch } from "./touch"

export class WindowsInputInjector implements PlatformInjector {
	private keyboard: WindowsKeyboard
	private touch: WindowsTouch
	private config: InputConfig

	constructor(config: Partial<InputConfig> = {}) {
		if (process.platform !== "win32") {
			throw new Error("WindowsInputInjector can only be used on Windows")
		}
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.keyboard = new WindowsKeyboard()
		this.touch = new WindowsTouch()
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

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

	injectMouseButton(button: MouseButton, isDown: boolean): void {
		const flagMap: Record<MouseButton, [number, number]> = {
			left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
			right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
			middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
		}

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

	injectKey(key: string, pos?: string): void {
		this.keyboard.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard.injectText(text)
	}

	injectTouch(contacts: TouchContact[]): void {
		this.touch.injectTouch(contacts)
	}

	destroy(): void {
		this.touch.destroy()
	}
}

export { WindowsKeyboard } from "./keyboard"
export { WindowsTouch } from "./touch"
