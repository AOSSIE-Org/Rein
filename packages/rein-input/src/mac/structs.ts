import koffi from "koffi"

// ── Load CoreGraphics ──────────────────────────────────────────────────────
const CG_PATH = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"

let _cg: ReturnType<typeof koffi.load> | null = null

function cg() {
	if (!_cg) {
		_cg = koffi.load(CG_PATH)
	}
	return _cg
}

// ── CGPoint ────────────────────────────────────────────────────────────────
export const CGPoint = koffi.struct("CGPoint", {
	x: "double",
	y: "double",
})

let _CGEventCreateMouseEvent: koffi.KoffiFunction | null = null
let _CGEventCreateKeyboardEvent: koffi.KoffiFunction | null = null
let _CGEventCreateScrollWheelEvent: koffi.KoffiFunction | null = null
let _CGEventPost: koffi.KoffiFunction | null = null
let _CFRelease: koffi.KoffiFunction | null = null
let _CGEventSetIntegerValueField: koffi.KoffiFunction | null = null

function ensureFunctions() {
	const lib = cg()
	if (!_CGEventCreateMouseEvent) {
		_CGEventCreateMouseEvent = lib.func(
			"void * CGEventCreateMouseEvent(void *, uint32, CGPoint, uint32)",
		)
		_CGEventCreateKeyboardEvent = lib.func(
			"void * CGEventCreateKeyboardEvent(void *, uint16, uint8)",
		)
		_CGEventCreateScrollWheelEvent = lib.func(
			"void * CGEventCreateScrollWheelEvent(void *, uint32, uint32, int32, int32)",
		)
		_CGEventPost = lib.func("void CGEventPost(uint32, void *)")
		_CFRelease = lib.func("void CFRelease(void *)")
	}
}

export function postMouseEvent(
	mouseType: number,
	x: number,
	y: number,
	button: number,
): void {
	ensureFunctions()
	const pt = { x, y }
	const ref = _CGEventCreateMouseEvent?.(null, mouseType, pt, button) as
		| bigint
		| number
		| null
	if (!ref) return
	_CGEventPost?.(0, ref) // 0 = kCGHIDEventTap
	_CFRelease?.(ref)
}

export function postKeyEvent(keyCode: number, keyDown: boolean): void {
	ensureFunctions()
	const ref = _CGEventCreateKeyboardEvent?.(null, keyCode, keyDown ? 1 : 0) as
		| bigint
		| number
		| null
	if (!ref) return
	_CGEventPost?.(0, ref)
	_CFRelease?.(ref)
}

export function postScrollEvent(deltaX: number, deltaY: number): void {
	ensureFunctions()
	const ref = _CGEventCreateScrollWheelEvent?.(
		null,
		1,
		2,
		Math.round(deltaY),
		Math.round(deltaX),
	) as bigint | number | null
	if (!ref) return
	_CGEventPost?.(0, ref)
	_CFRelease?.(ref)
}

export const NX_KEYTYPE_PLAY = 16
export const NX_KEYTYPE_NEXT = 17
export const NX_KEYTYPE_PREVIOUS = 18
export const NX_KEYTYPE_FAST = 19
export const NX_KEYTYPE_REWIND = 20

const NX_SYSDEFINED = 14 // NSEventTypeSystemDefined
const NX_SUBTYPE_AUX = 8 // NX_SUBTYPE_AUX_CONTROL_BUTTONS

let _CGEventCreate: koffi.KoffiFunction | null = null
let _CGEventSetType: koffi.KoffiFunction | null = null

function ensureMediaFunctions() {
	ensureFunctions()
	if (!_CGEventCreate) {
		const lib = cg()
		_CGEventCreate = lib.func("void * CGEventCreate(void *)")
		_CGEventSetType = lib.func("void CGEventSetType(void *, uint32)")
		_CGEventSetIntegerValueField = lib.func(
			"void CGEventSetIntegerValueField(void *, uint32, int64)",
		)
	}
}

/**
 * Post a macOS media key event (play, next, prev, etc.).
 * `keyType` is one of the NX_KEYTYPE_* constants above.
 */
export function postMediaKeyEvent(keyType: number): void {
	ensureMediaFunctions()
	if (
		!_CGEventCreate ||
		!_CGEventSetType ||
		!_CGEventSetIntegerValueField ||
		!_CGEventPost ||
		!_CFRelease
	)
		return

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
