/**
 * Linux virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection through a uinput
 * keyboard device. Converts application-level key names and characters
 * into Linux key codes and emits the corresponding press/release events.
 */
import { writeEvent } from "./structs.ts"
import {
	EV_SYN,
	EV_KEY,
	SYN_REPORT,
	KEY_PRESS,
	KEY_RELEASE,
} from "./constants.ts"
import { LINUX_KEY_MAP } from "../keyMap.ts"
import { resolveChar } from "../utils.ts"
export class LinuxKeyboard {
	private fd: number

	constructor(fd: number) {
		this.fd = fd
	}

	injectKey(key: string): void {
		const code = LINUX_KEY_MAP[key.toLowerCase()]

		if (code !== undefined) {
			this.sendKeyEvent(code, KEY_PRESS)
			this.sendKeyEvent(code, KEY_RELEASE)
		} else if (key.length === 1) {
			this.injectText(key)
		} else {
			console.warn("[LinuxKeyboard] Unknown key:", key)
		}
	}

	injectCombo(keys: string[]): void {
		const codes: number[] = []
		for (const k of keys) {
			const code = LINUX_KEY_MAP[k.toLowerCase()]
			if (code !== undefined) {
				codes.push(code)
			} else {
				console.warn("[LinuxKeyboard] Unknown combo key:", k)
			}
		}
		if (codes.length === 0) return

		// Press all
		for (const code of codes) {
			this.sendKeyEvent(code, KEY_PRESS)
		}
		this.sync()

		// Release in reverse
		for (let i = codes.length - 1; i >= 0; i--) {
			this.sendKeyEvent(codes[i], KEY_RELEASE)
		}
		this.sync()
	}

	injectText(text: string): void {
		if (!text) return

		for (const ch of text) {
			const { code, shifted } = resolveChar(ch, LINUX_KEY_MAP)
			if (code === undefined) {
				console.warn("[LinuxKeyboard] No key mapping for char:", ch)
				continue
			}
			if (shifted) {
				const shiftCode = LINUX_KEY_MAP.shift
				if (shiftCode === undefined) {
					console.warn("[LinuxKeyboard] Shift key code not defined in key map")
					continue
				}
				this.sendKeyEvent(shiftCode, KEY_PRESS)
			}
			this.sendKeyEvent(code, KEY_PRESS)
			this.sendKeyEvent(code, KEY_RELEASE)
			if (shifted) {
				this.sendKeyEvent(LINUX_KEY_MAP.shift, KEY_RELEASE)
			}
			this.sync()
		}
	}

	private sendKeyEvent(code: number, value: number): void {
		writeEvent(this.fd, EV_KEY, code, value)
	}

	private sync(): void {
		writeEvent(this.fd, EV_SYN, SYN_REPORT, 0)
	}
}
