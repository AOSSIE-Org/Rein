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
					this.pasteViaClipboard(ch).catch((err) => {
						console.warn("[LinuxKeyboard] pasteViaClipboard failed:", err)
					})
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
		this.pasteViaClipboard(text).catch((err) => {
			console.warn("[LinuxKeyboard] pasteViaClipboard failed:", err)
		})
	}

	private async pasteViaClipboard(text: string): Promise<void> {
		const { spawn } = await import("node:child_process")

		const tryClip = (cmd: string, args: string[]): Promise<boolean> =>
			new Promise((resolve) => {
				try {
					const child = spawn(cmd, args, {
						stdio: ["pipe", "ignore", "ignore"],
					})
					const timer = setTimeout(() => {
						child.kill("SIGKILL")
						resolve(false)
					}, 3000)
					child.on("error", () => {
						clearTimeout(timer)
						resolve(false)
					})
					child.on("close", (code) => {
						clearTimeout(timer)
						resolve(code === 0)
					})
					child.stdin.end(text, "utf8")
				} catch {
					resolve(false)
				}
			})

		const ok =
			(await tryClip("xclip", ["-selection", "clipboard"])) ||
			(await tryClip("xsel", ["--clipboard", "--input"])) ||
			(await tryClip("wl-copy", []))

		if (!ok) {
			console.warn("[LinuxKeyboard] No clipboard writer available")
			return
		}

		// Small delay — X11 / Wayland need a moment to propagate the clipboard
		// selection before the paste target reads it.
		await new Promise((r) => setTimeout(r, 30))

		const ctrl = LINUX_KEY_MAP.control
		const v = LINUX_KEY_MAP.v
		if (ctrl !== undefined && v !== undefined) {
			this.sendKeyEvent(ctrl, KEY_PRESS)
			this.sendKeyEvent(v, KEY_PRESS)
			this.sendKeyEvent(v, KEY_RELEASE)
			this.sendKeyEvent(ctrl, KEY_RELEASE)
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
