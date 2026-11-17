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
import { MAX_INPUT_EVENTS_PER_BATCH } from "./constants.ts"

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

		let currentBatch: WindowsInput[] = []

		for (let i = 0; i < text.length; i++) {
			const c = text.charCodeAt(i)
			const isHighSurrogate = c >= 0xd800 && c <= 0xdbff
			const hasLowSurrogate =
				isHighSurrogate &&
				i + 1 < text.length &&
				text.charCodeAt(i + 1) >= 0xdc00 &&
				text.charCodeAt(i + 1) <= 0xdfff

			const eventsNeeded = hasLowSurrogate ? 4 : 2

			// Flush current batch if adding these events would exceed the 1000 event limit
			if (currentBatch.length + eventsNeeded > MAX_INPUT_EVENTS_PER_BATCH) {
				if (!this.sendInput(currentBatch)) return
				currentBatch = []
			}

			if (hasLowSurrogate) {
				const low = text.charCodeAt(i + 1)
				currentBatch.push(
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
					{
						type: INPUT_KEYBOARD,
						u: {
							ki: {
								wVk: 0,
								wScan: low,
								dwFlags: KEYEVENTF_UNICODE,
							},
						},
					},
					{
						type: INPUT_KEYBOARD,
						u: {
							ki: {
								wVk: 0,
								wScan: low,
								dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
							},
						},
					},
				)
				i++
			} else {
				currentBatch.push(
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
		}

		if (currentBatch.length > 0) {
			this.sendInput(currentBatch)
		}
	}

	private sendInput(events: WindowsInput[]): boolean {
		if (events.length === 0) {
			console.warn("[SendInput] No events to send")
			return false
		}

		let remaining = events
		while (remaining.length > 0) {
			const result = sendInput(remaining)
			if (result === remaining.length) return true

			console.error(
				"[SendInput] SendInput failed! Sent:",
				result,
				"of",
				remaining.length,
			)
			if (result <= 0) return false
			remaining = remaining.slice(result)
		}

		return true
	}
}
