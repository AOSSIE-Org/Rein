/**
 * Windows virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection using the Win32
 * SendInput API. Supports both virtual-key based input and Unicode
 * character injection for reliable text entry across applications.
 */
import {
	sendInput,
	INPUT_KEYBOARD,
	KEYEVENTF_KEYUP,
	KEYEVENTF_UNICODE,
	type WindowsInput,
} from "@imxade/inject/windows"
import { VK_MAP } from "../keyMap.ts"

export class WindowsKeyboard {
	injectKey(key: string, pos: string = ""): void {
		const lowerKey = key.toLowerCase()
		const vk = VK_MAP[lowerKey]

		if (vk !== undefined) {
			const events: WindowsInput[] = []
			if (pos !== "RELEASE") {
				events.push({
					type: INPUT_KEYBOARD,
					u: { ki: { wVk: vk, wScan: 0, dwFlags: 0 } },
				})
			}
			if (pos !== "HOLD") {
				events.push({
					type: INPUT_KEYBOARD,
					u: {
						ki: {
							wVk: vk,
							wScan: 0,
							dwFlags: KEYEVENTF_KEYUP,
						},
					},
				})
			}
			this.sendInput(events)
		} else if (key.length === 1) {
			this.injectText(key)
		} else {
			console.warn("[Keyboard] Unknown key and not a single character:", key)
		}
	}

	injectCombo(keys: string[]): void {
		const vks = keys
			.map((k) => VK_MAP[k.toLowerCase()])
			.filter((vk): vk is number => vk !== undefined)

		if (vks.length === 0) {
			console.warn("[Combo] No valid VK codes found, aborting")
			return
		}

		const events: WindowsInput[] = []

		// Press all keys
		for (const vk of vks) {
			events.push({
				type: INPUT_KEYBOARD,
				u: { ki: { wVk: vk, wScan: 0, dwFlags: 0 } },
			})
		}

		// Release in reverse order
		for (let i = vks.length - 1; i >= 0; i--) {
			events.push({
				type: INPUT_KEYBOARD,
				u: {
					ki: {
						wVk: vks[i],
						wScan: 0,
						dwFlags: KEYEVENTF_KEYUP,
					},
				},
			})
		}

		this.sendInput(events)
	}

	injectText(text: string): void {
		if (!text) {
			console.warn("[Text] Empty text, returning")
			return
		}
		for (const ch of text) {
			const c = ch.charCodeAt(0)

			this.sendInput([
				{
					type: INPUT_KEYBOARD,
					u: {
						ki: {
							wVk: 0,
							wScan: c,
							dwFlags: KEYEVENTF_UNICODE,
						},
					},
				},
				{
					type: INPUT_KEYBOARD,
					u: {
						ki: {
							wVk: 0,
							wScan: c,
							dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
						},
					},
				},
			])
		}
	}

	private sendInput(events: WindowsInput[]): void {
		if (events.length === 0) {
			console.warn("[SendInput] No events to send")
			return
		}

		const result = sendInput(events)

		if (result !== events.length) {
			console.error(
				"[SendInput] SendInput failed! Sent:",
				result,
				"of",
				events.length,
			)
		}
	}
}
