/**
 * Windows virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection using the Win32
 * SendInput API. Supports both virtual-key based input and Unicode
 * character injection for reliable text entry across applications.
 *
 * Windows notes:
 * - SendInput can partially insert events when its internal queue (~64
 *   events) is full. Callers must check the return value and retry.
 * - Injecting hundreds of Unicode events in a tight loop causes dropped
 *   or duplicated characters. We yield to the event loop every N chars.
 */
import { SendInput, INPUT_STRUCT_SIZE } from "./structs.ts"
import { KEYEVENTF_KEYUP, KEYEVENTF_UNICODE } from "./constants.ts"
import { INPUT_KEYBOARD } from "../../constants.ts"
import { VK_MAP } from "../keyMap.ts"

const CHARS_PER_BATCH = 20
const BATCH_DELAY_MS = 5
const MAX_SEND_ATTEMPTS = 3
const RETRY_SPIN_MS = 2

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
			this.injectText(key).catch((err) => {
				console.error("[WindowsKeyboard] injectText failed:", err)
			})
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

	/**
	 * Inject text as Unicode key events.
	 *
	 * Yields to the event loop every `CHARS_PER_BATCH` characters so Windows
	 * can drain its input queue. Without this, long text pastes overflow the
	 * ~64-event queue and characters are dropped or duplicated.
	 *
	 * Now async — the caller (InputHandler) should handle the returned Promise
	 * (fire-and-forget with error logging is fine).
	 */
	async injectText(text: string): Promise<void> {
		if (!text) {
			console.warn("[Text] Empty text, returning")
			return
		}

		let charsInBatch = 0

		for (const ch of text) {
			const codePoint = ch.codePointAt(0)
			if (codePoint === undefined) continue

			if (codePoint > 0xffff) {
				// Surrogate pair (e.g. 😀 U+1F600) — must be sent as two halves.
				const high = Math.floor((codePoint - 0x10000) / 0x400) + 0xd800
				const low = ((codePoint - 0x10000) % 0x400) + 0xdc00
				this.sendUnicodeCharWithRetry(high)
				this.sendUnicodeCharWithRetry(low)
			} else {
				// BMP character (capitals, accents, CJK, etc.)
				this.sendUnicodeCharWithRetry(codePoint)
			}

			charsInBatch++
			if (charsInBatch >= CHARS_PER_BATCH) {
				charsInBatch = 0
				// Let Windows process the queued events before adding more.
				await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
			}
		}
	}

	/**
	 * Send a single Unicode code unit, retrying if SendInput partially inserts.
	 *
	 * SendInput returns the number of events successfully inserted. If it
	 * returns less than requested, the OS input queue was full — we spin
	 * briefly and retry.
	 */
	private sendUnicodeCharWithRetry(code: number): void {
		for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
			if (this.sendUnicodeCharOnce(code)) return

			// Busy-wait a couple of ms — sendInput is sync so we can't await here.
			const deadline = Date.now() + RETRY_SPIN_MS
			while (Date.now() < deadline) {
				/* spin */
			}
		}
		console.warn(
			`[WindowsKeyboard] Failed to inject U+${code
				.toString(16)
				.toUpperCase()} after ${MAX_SEND_ATTEMPTS} attempts`,
		)
	}

	private sendUnicodeCharOnce(code: number): boolean {
		return this.sendInput(2, [
			{
				type: INPUT_KEYBOARD,
				__pad: 0,
				u: {
					ki: {
						wVk: 0,
						wScan: code,
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
						wScan: code,
						dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			},
		])
	}

	/**
	 * Wrapper around SendInput. Returns true when all events were inserted.
	 */
	private sendInput(
		count: number,
		events: Array<Record<string, unknown>>,
	): boolean {
		if (events.length === 0) {
			console.warn("[SendInput] No events to send")
			return true
		}

		const result = SendInput(count, events, INPUT_STRUCT_SIZE)

		if (result !== count) {
			console.warn(
				`[SendInput] Partial insert: ${result} of ${count} events (input queue full?)`,
			)
			return false
		}
		return true
	}
}
