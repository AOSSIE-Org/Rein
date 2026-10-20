/**
 * macOS virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection through CoreGraphics
 * keyboard events. Supports both key-code based input and Unicode
 * character injection for characters not present in the standard key map.
 */
import {
	postKeyEvent,
	postMediaKeyEvent,
	injectUnicode,
	NX_KEYTYPE_PLAY,
	NX_KEYTYPE_NEXT,
	NX_KEYTYPE_PREVIOUS,
} from "./structs.ts"
import { MAC_KEY_MAP } from "../keyMap.ts"
import { resolveChar } from "../utils.ts"

// Media transport keys that require NX_SYSDEFINED events
const MEDIA_KEY_MAP: Record<string, number> = {
	audioplay: NX_KEYTYPE_PLAY,
	audiopause: NX_KEYTYPE_PLAY,
	audionext: NX_KEYTYPE_NEXT,
	audioprev: NX_KEYTYPE_PREVIOUS,
	audiostop: NX_KEYTYPE_PLAY,
}

export class MacKeyboard {
	injectKey(key: string, pos: string): void {
		const lowerKey = key.toLowerCase()

		// Media transport keys need NX_SYSDEFINED events, not keyboard keycodes
		const mediaType = MEDIA_KEY_MAP[lowerKey]
		if (mediaType !== undefined) {
			postMediaKeyEvent(mediaType)
			return
		}

		const code = MAC_KEY_MAP[lowerKey]
		if (code !== undefined) {
			if (pos !== "RELEASE") postKeyEvent(code, true)
			if (pos !== "HOLD") postKeyEvent(code, false)
		} else if (key.length === 1) {
			this.injectText(key)
		} else {
			console.warn("[MacKeyboard] Unknown key:", key)
		}
	}

	injectCombo(keys: string[]): void {
		const codes: number[] = []
		for (const k of keys) {
			const code = MAC_KEY_MAP[k.toLowerCase()]
			if (code !== undefined) {
				codes.push(code)
			} else {
				console.warn("[MacKeyboard] Unknown combo key:", k)
			}
		}
		if (codes.length === 0) return

		// Press all keys down
		for (const code of codes) {
			postKeyEvent(code, true)
		}
		// Release in reverse order
		for (let i = codes.length - 1; i >= 0; i--) {
			postKeyEvent(codes[i], false)
		}
	}

	injectText(text: string): void {
		if (!text) return
		for (const ch of text) {
			const { code, shifted } = resolveChar(ch, MAC_KEY_MAP)
			const shiftCode = MAC_KEY_MAP.shift
			if (code === undefined) {
				// Fall back to Unicode injection for unmapped characters.
				this.injectUnicodeChar(ch)
				continue
			}
			if (shiftCode === undefined) {
				console.warn("[MacKeyboard] Shift key code not defined in key map")
				continue
			}
			if (shifted) postKeyEvent(shiftCode, true)
			postKeyEvent(code, true)
			postKeyEvent(code, false)
			if (shifted) postKeyEvent(shiftCode, false)
		}
	}
	private injectUnicodeChar(ch: string): void {
		injectUnicode(ch)
	}
}
