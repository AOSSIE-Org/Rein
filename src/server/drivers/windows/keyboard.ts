/**
 * Windows virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection using the Win32
 * SendInput API. Supports both virtual-key based input and Unicode
 * character injection for reliable text entry across applications.
 */
import { SendInput, INPUT_STRUCT_SIZE } from "./structs.ts"
import {
	KEYEVENTF_KEYUP,
	KEYEVENTF_UNICODE,
	KEYEVENTF_SCANCODE,
} from "./constants.ts"
import { INPUT_KEYBOARD } from "../../constants.ts"
import { VK_MAP, VK_TO_SCANCODE } from "../keyMap.ts"

export class WindowsKeyboard {
	injectKey(key: string, pos: string = ""): void {
		const lowerKey = key.toLowerCase()
		const vk = VK_MAP[lowerKey]

		if (vk !== undefined) {
			// Convert virtual key to hardware scancode so games
			// (DirectInput/RawInput) recognize the input.
			const scancode = VK_TO_SCANCODE[vk]

			if (scancode === undefined) {
				console.warn(
					`[Keyboard] No scancode mapping for VK 0x${vk.toString(16)} (${key})`,
				)
				return
			}

			const events: Array<Record<string, unknown>> = []
			if (pos !== "RELEASE") {
				events.push({
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk: 0,
							wScan: scancode,
							dwFlags: KEYEVENTF_SCANCODE,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				})
			}
			if (pos !== "HOLD") {
				events.push({
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk: 0,
							wScan: scancode,
							dwFlags: KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				})
			}
			this.sendInput(events.length, events)
		} else if (key.length === 1) {
			this.injectText(key)
		} else {
			console.warn("[Keyboard] Unknown key and not a single character:", key)
		}
	}

	injectCombo(keys: string[]): void {
		const vks = keys
			.map((k) => {
				const vk = VK_MAP[k.toLowerCase()]

				return vk
			})
			.filter((vk): vk is number => vk !== undefined)

		if (vks.length === 0) {
			console.warn("[Combo] No valid VK codes found, aborting")
			return
		}

		const events: Array<Record<string, unknown>> = []

		// Press all keys
		for (const vk of vks) {
			events.push({
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: { ki: { wVk: vk, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } },
			})
		}

		// Release in reverse order
		for (let i = vks.length - 1; i >= 0; i--) {
			events.push({
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: {
					ki: {
						wVk: vks[i],
						wScan: 0,
						dwFlags: KEYEVENTF_KEYUP,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			})
		}

		this.sendInput(events.length, events)
	}

	injectText(text: string): void {
		if (!text) {
			console.warn("[Text] Empty text, returning")
			return
		}

		// Single character that maps to a known virtual key should use
		// key events (with scancodes) so games recognize it as physical
		// keyboard input.
		if (text.length === 1) {
			const lowerKey = text.toLowerCase()
			const vk = VK_MAP[lowerKey]
			if (vk !== undefined) {
				this.injectKey(text, "")
				return
			}
		}

		for (const ch of text) {
			const c = ch.charCodeAt(0)

			this.sendInput(2, [
				{
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk: 0,
							wScan: c,
							dwFlags: KEYEVENTF_UNICODE,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				},
				{
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk: 0,
							wScan: c,
							dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				},
			])
		}
	}

	private sendInput(
		count: number,
		events: Array<Record<string, unknown>>,
	): void {
		if (events.length === 0) {
			console.warn("[SendInput] No events to send")
			return
		}

		const result = SendInput(count, events, INPUT_STRUCT_SIZE)

		if (result !== count) {
			console.error("[SendInput] SendInput failed! Sent:", result, "of", count)
		}
	}
}
