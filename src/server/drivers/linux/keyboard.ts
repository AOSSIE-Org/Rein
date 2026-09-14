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

	injectKey(key: string, pos: string): void {
		const code = LINUX_KEY_MAP[key.toLowerCase()]

		if (code !== undefined) {
			if (pos !== "RELEASE") {
				this.sendKeyEvent(code, KEY_PRESS)
			}
			if (pos !== "HOLD") {
				this.sendKeyEvent(code, KEY_RELEASE)
			}
			this.sync()
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

		// Check for any char outside ASCII range (0–127) using code points,
		// which avoids control-character literals that Biome disallows.
		let hasNonAscii = false
		for (const ch of text) {
			const cp = ch.codePointAt(0)
			if (cp !== undefined && cp > 0x7f) {
				hasNonAscii = true
				break
			}
		}

		if (!hasNonAscii) {
			// Pure ASCII — use fast keycode path
			for (const ch of text) {
				const { code, shifted } = resolveChar(ch, LINUX_KEY_MAP)
				if (code === undefined) {
					this.pasteViaClipboard(ch)
					continue
				}
				if (shifted) {
					this.sendKeyEvent(LINUX_KEY_MAP.shift, KEY_PRESS)
				}
				this.sendKeyEvent(code, KEY_PRESS)
				this.sendKeyEvent(code, KEY_RELEASE)
				if (shifted) {
					this.sendKeyEvent(LINUX_KEY_MAP.shift, KEY_RELEASE)
				}
				this.sync()
			}
			return
		}

		// Unicode present — batch-paste the whole string via clipboard
		this.pasteViaClipboard(text)
	}

	private pasteViaClipboard(text: string): void {
		try {
			// Write text to the X11 / Wayland clipboard
			const { execSync } = require("node:child_process")
			const encoded = Buffer.from(text, "utf8").toString("base64")
			execSync(
				`printf '%s' '${encoded}' | base64 -d | ` +
					`(xclip -selection clipboard 2>/dev/null || ` +
					`xsel --clipboard --input 2>/dev/null || ` +
					`wl-copy 2>/dev/null)`,
				{ stdio: "ignore" },
			)

			// Simulate Ctrl+V
			const ctrl = LINUX_KEY_MAP.control
			const v = LINUX_KEY_MAP.v
			if (ctrl !== undefined && v !== undefined) {
				this.sendKeyEvent(ctrl, KEY_PRESS)
				this.sendKeyEvent(v, KEY_PRESS)
				this.sendKeyEvent(v, KEY_RELEASE)
				this.sendKeyEvent(ctrl, KEY_RELEASE)
				this.sync()
			}
		} catch (err) {
			console.warn("[LinuxKeyboard] Clipboard paste failed:", err)
		}
	}

	private sendKeyEvent(code: number, value: number): void {
		writeEvent(this.fd, EV_KEY, code, value)
	}

	private sync(): void {
		writeEvent(this.fd, EV_SYN, SYN_REPORT, 0)
	}
}
