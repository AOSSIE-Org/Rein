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
	KEYEVENTF_EXTENDEDKEY,
} from "./constants.ts"
import { INPUT_KEYBOARD } from "../../constants.ts"
import { EXTENDED_KEY_VKS, VK_MAP, VK_TO_SCANCODE } from "../keyMap.ts"

export class WindowsKeyboard {
	injectKey(key: string, pos: string = ""): void {
		const lowerKey = key.toLowerCase()
		const vk = VK_MAP[lowerKey]

		if (vk !== undefined) {
			const scancode = VK_TO_SCANCODE[vk]
			const extendedFlag = EXTENDED_KEY_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0
			const scanFlag = scancode !== undefined ? KEYEVENTF_SCANCODE : 0
			const wVk = scancode !== undefined ? 0 : vk
			const wScan = scancode ?? 0

			const events: Array<Record<string, unknown>> = []
			if (pos !== "RELEASE") {
				events.push({
					type: INPUT_KEYBOARD,
					__pad: 0,
					u: {
						ki: {
							wVk,
							wScan,
							dwFlags: scanFlag | extendedFlag,
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
							wVk,
							wScan,
							dwFlags: scanFlag | extendedFlag | KEYEVENTF_KEYUP,
							time: 0,
							dwExtraInfo: 0,
						},
					},
				})
			}
			this.sendInput(events.length, events)
		} else if (key.length === 1 && pos === "") {
			this.injectText(key)
		} else {
			console.warn("[Keyboard] Unknown or unmapped key:", key)
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

		for (const vk of vks) {
			const scancode = VK_TO_SCANCODE[vk]
			const extendedFlag = EXTENDED_KEY_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0
			const scanFlag = scancode !== undefined ? KEYEVENTF_SCANCODE : 0
			events.push({
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: {
					ki: {
						wVk: scancode !== undefined ? 0 : vk,
						wScan: scancode ?? 0,
						dwFlags: scanFlag | extendedFlag,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			})
		}

		for (let i = vks.length - 1; i >= 0; i--) {
			const vk = vks[i]
			const scancode = VK_TO_SCANCODE[vk]
			const extendedFlag = EXTENDED_KEY_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0
			const scanFlag = scancode !== undefined ? KEYEVENTF_SCANCODE : 0
			events.push({
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: {
					ki: {
						wVk: scancode !== undefined ? 0 : vk,
						wScan: scancode ?? 0,
						dwFlags: scanFlag | extendedFlag | KEYEVENTF_KEYUP,
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
