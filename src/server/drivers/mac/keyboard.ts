/**
 * macOS virtual keyboard implementation.
 *
 * Handles key, key-combination, and text injection through CoreGraphics
 * keyboard events. Supports both key-code based input and Unicode
 * character injection for characters not present in the standard key map.
 */
import koffi from "koffi"
import { postKeyEvent } from "@imxade/inject/mac"
import { kCGHIDEventTap } from "./constants.ts"
import { MAC_KEY_MAP } from "../keyMap.ts"

export const NX_KEYTYPE_PLAY = 16
export const NX_KEYTYPE_NEXT = 17
export const NX_KEYTYPE_PREVIOUS = 18
export const NX_KEYTYPE_FAST = 19
export const NX_KEYTYPE_REWIND = 20

const NX_SYSDEFINED = 14 // NSEventTypeSystemDefined
const NX_SUBTYPE_AUX = 8 // NX_SUBTYPE_AUX_CONTROL_BUTTONS

const CG_PATH = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
let _cg: ReturnType<typeof koffi.load> | null = null

function cg() {
	if (!_cg) {
		_cg = koffi.load(CG_PATH)
	}
	return _cg
}

let _CGEventCreateKeyboardEvent: koffi.KoffiFunction | null = null
let _CGEventKeyboardSetUnicodeString: koffi.KoffiFunction | null = null
let _CGEventCreate: koffi.KoffiFunction | null = null
let _CGEventSetType: koffi.KoffiFunction | null = null
let _CGEventSetIntegerValueField: koffi.KoffiFunction | null = null
let _CGEventPost: koffi.KoffiFunction | null = null
let _CFRelease: koffi.KoffiFunction | null = null

function ensureCoreGraphicsFunctions(): void {
	if (_CGEventPost) return
	const lib = cg()
	_CGEventCreateKeyboardEvent = lib.func(
		"void * CGEventCreateKeyboardEvent(void *, uint16, uint8)",
	)
	_CGEventKeyboardSetUnicodeString = lib.func(
		"void CGEventKeyboardSetUnicodeString(void *, size_t, void *)",
	)
	_CGEventCreate = lib.func("void * CGEventCreate(void *)")
	_CGEventSetType = lib.func("void CGEventSetType(void *, uint32)")
	_CGEventSetIntegerValueField = lib.func(
		"void CGEventSetIntegerValueField(void *, uint32, int64)",
	)
	_CGEventPost = lib.func("void CGEventPost(uint32, void *)")
	_CFRelease = lib.func("void CFRelease(void *)")
}

function postKey(keyCode: number, keyDown: boolean): void {
	postKeyEvent(kCGHIDEventTap, keyCode, keyDown)
}

function injectUnicode(ch: string): void {
	ensureCoreGraphicsFunctions()
	if (
		!_CGEventCreateKeyboardEvent ||
		!_CGEventKeyboardSetUnicodeString ||
		!_CGEventPost ||
		!_CFRelease
	) {
		return
	}
	const buf = Buffer.from(ch, "utf16le")
	const charCount = buf.length / 2

	const downRef = _CGEventCreateKeyboardEvent(null, 0, 1) as
		| bigint
		| number
		| null
	if (!downRef) return
	_CGEventKeyboardSetUnicodeString(downRef, charCount, buf)
	_CGEventPost(0, downRef)
	_CFRelease(downRef)

	const upRef = _CGEventCreateKeyboardEvent(null, 0, 0) as
		| bigint
		| number
		| null
	if (!upRef) return
	_CGEventKeyboardSetUnicodeString(upRef, charCount, buf)
	_CGEventPost(0, upRef)
	_CFRelease(upRef)
}

function postMediaKeyEvent(keyType: number): void {
	ensureCoreGraphicsFunctions()
	if (
		!_CGEventCreate ||
		!_CGEventSetType ||
		!_CGEventSetIntegerValueField ||
		!_CGEventPost ||
		!_CFRelease
	) {
		return
	}

	// Key-down: data = (keyType << 16) | (0xa << 8)   [flags=0xa = key-down]
	const downData = (keyType << 16) | (0x0a << 8)
	const downRef = _CGEventCreate(null) as bigint | number | null
	if (!downRef) return
	_CGEventSetType(downRef, NX_SYSDEFINED)
	_CGEventSetIntegerValueField(downRef, 131, NX_SUBTYPE_AUX) // field 131 = eventSubtype
	_CGEventSetIntegerValueField(downRef, 132, downData) // field 132 = eventData1
	_CGEventPost(0, downRef)
	_CFRelease(downRef)

	// Key-up: data = (keyType << 16) | (0xb << 8)     [flags=0xb = key-up]
	const upData = (keyType << 16) | (0x0b << 8)
	const upRef = _CGEventCreate(null) as bigint | number | null
	if (!upRef) return
	_CGEventSetType(upRef, NX_SYSDEFINED)
	_CGEventSetIntegerValueField(upRef, 131, NX_SUBTYPE_AUX)
	_CGEventSetIntegerValueField(upRef, 132, upData)
	_CGEventPost(0, upRef)
	_CFRelease(upRef)
}

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
			if (pos !== "RELEASE") postKey(code, true)
			if (pos !== "HOLD") postKey(code, false)
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
			postKey(code, true)
		}
		// Release in reverse order
		for (let i = codes.length - 1; i >= 0; i--) {
			postKey(codes[i], false)
		}
	}

	injectText(text: string): void {
		if (!text) return
		for (const ch of text) {
			this.injectUnicodeChar(ch)
		}
	}
	private injectUnicodeChar(ch: string): void {
		injectUnicode(ch)
	}
}
