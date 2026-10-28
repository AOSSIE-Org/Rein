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
	KEYEVENTF_SCANCODE,
	KEYEVENTF_EXTENDEDKEY,
	type WindowsInput,
} from "@imxade/inject/windows"
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

			const events: WindowsInput[] = []
			if (pos !== "RELEASE") {
				events.push({
					type: INPUT_KEYBOARD,
					u: {
						ki: {
							wVk,
							wScan,
							dwFlags: scanFlag | extendedFlag,
						},
					},
				})
			}
			if (pos !== "HOLD") {
				events.push({
					type: INPUT_KEYBOARD,
					u: {
						ki: {
							wVk,
							wScan,
							dwFlags: scanFlag | extendedFlag | KEYEVENTF_KEYUP,
						},
					},
				})
			}
			this.sendInput(events)
		} else if (key.length === 1 && pos === "") {
			this.injectText(key)
		} else {
			console.warn("[Keyboard] Unknown or unmapped key:", key)
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
			const extendedFlag = EXTENDED_KEY_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0
			events.push({
				type: INPUT_KEYBOARD,
				u: { ki: { wVk: vk, wScan: 0, dwFlags: extendedFlag } },
			})
		}

		// Release in reverse order
		for (let i = vks.length - 1; i >= 0; i--) {
			const vk = vks[i]
			const extendedFlag = EXTENDED_KEY_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0
			events.push({
				type: INPUT_KEYBOARD,
				u: {
					ki: {
						wVk: vk,
						wScan: 0,
						dwFlags: extendedFlag | KEYEVENTF_KEYUP,
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
		const events: WindowsInput[] = []
		for (let i = 0; i < text.length; i++) {
			const c = text.charCodeAt(i)

			events.push(
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
			)
		}
		this.sendInput(events)
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
