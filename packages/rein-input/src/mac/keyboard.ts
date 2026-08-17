import {
	postKeyEvent,
	postMediaKeyEvent,
	NX_KEYTYPE_PLAY,
	NX_KEYTYPE_NEXT,
	NX_KEYTYPE_PREVIOUS,
} from "./structs"
import { MAC_KEY_MAP } from "../keyMap"
import { resolveChar } from "../utils"

// Media transport keys that require NX_SYSDEFINED events
const MEDIA_KEY_MAP: Record<string, number> = {
	audioplay: NX_KEYTYPE_PLAY,
	audiopause: NX_KEYTYPE_PLAY,
	audionext: NX_KEYTYPE_NEXT,
	audioprev: NX_KEYTYPE_PREVIOUS,
	audiostop: NX_KEYTYPE_PLAY,
}

export class MacKeyboard {
	injectKey(key: string, pos: string = ""): void {
		const lowerKey = key.toLowerCase()

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

		for (const code of codes) {
			postKeyEvent(code, true)
		}
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

// Unicode injection fallback via CoreGraphics
let _unicodeInjectorLoaded = false
let _CGEventCreateKeyboardEvent:
	| ((s: null, k: number, d: number) => unknown)
	| null = null
let _CGEventKeyboardSetUnicodeString:
	| ((e: unknown, l: number, s: Buffer) => void)
	| null = null
let _CGEventPost: ((tap: number, e: unknown) => void) | null = null
let _CFRelease: ((r: unknown) => void) | null = null

function ensureUnicode() {
	if (_unicodeInjectorLoaded) return
	_unicodeInjectorLoaded = true
	try {
		const koffi = require("koffi")
		const lib = koffi.load(
			"/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
		)
		_CGEventCreateKeyboardEvent = lib.func(
			"void * CGEventCreateKeyboardEvent(void *, uint16, uint8)",
		)
		_CGEventKeyboardSetUnicodeString = lib.func(
			"void CGEventKeyboardSetUnicodeString(void *, size_t, void *)",
		)
		_CGEventPost = lib.func("void CGEventPost(uint32, void *)")
		_CFRelease = lib.func("void CFRelease(void *)")
	} catch (e) {
		console.warn(
			"[MacKeyboard] Failed to load CoreGraphics for Unicode injection:",
			e,
		)
	}
}

function injectUnicode(ch: string): void {
	ensureUnicode()
	if (
		!_CGEventCreateKeyboardEvent ||
		!_CGEventKeyboardSetUnicodeString ||
		!_CGEventPost ||
		!_CFRelease
	)
		return
	const buf = Buffer.from(ch, "utf16le")
	const charCount = buf.length / 2

	const downRef = _CGEventCreateKeyboardEvent(null, 0, 1)
	if (!downRef) return
	_CGEventKeyboardSetUnicodeString(downRef, charCount, buf)
	_CGEventPost(0, downRef)
	_CFRelease(downRef)

	const upRef = _CGEventCreateKeyboardEvent(null, 0, 0)
	if (!upRef) return
	_CGEventKeyboardSetUnicodeString(upRef, charCount, buf)
	_CGEventPost(0, upRef)
	_CFRelease(upRef)
}
