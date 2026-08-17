import { SendInput, INPUT_STRUCT_SIZE } from "./structs"
import { KEYEVENTF_KEYUP, KEYEVENTF_UNICODE } from "./constants"
import { INPUT_KEYBOARD } from "../constants"
import { VK_MAP } from "../keyMap"

export class WindowsKeyboard {
	injectKey(key: string, pos: string = ""): void {
		const lowerKey = key.toLowerCase()
		const vk = VK_MAP[lowerKey]

		if (vk !== undefined) {
			const events: Array<Record<string, unknown>> = []
			if (pos !== "RELEASE") {
				events.push({
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: { ki: { wVk: vk, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } },
				})
			}
			if (pos !== "HOLD") {
				events.push({
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk: vk,
							wScan: 0,
							dwFlags: KEYEVENTF_KEYUP,
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
			console.warn(
				"[WindowsKeyboard] Unknown key and not a single character:",
				key,
			)
		}
	}

	injectCombo(keys: string[]): void {
		const vks = keys
			.map((k) => VK_MAP[k.toLowerCase()])
			.filter((vk): vk is number => vk !== undefined)

		if (vks.length === 0) {
			console.warn("[WindowsKeyboard] No valid VK codes found, aborting")
			return
		}

		const events: Array<Record<string, unknown>> = []

		for (const vk of vks) {
			events.push({
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: { ki: { wVk: vk, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } },
			})
		}

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
			console.warn("[WindowsKeyboard] Empty text, returning")
			return
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
			console.warn("[WindowsKeyboard] No events to send")
			return
		}

		const result = SendInput(count, events, INPUT_STRUCT_SIZE)

		if (result !== count) {
			console.error(
				"[WindowsKeyboard] SendInput failed! Sent:",
				result,
				"of",
				count,
			)
		}
	}
}
