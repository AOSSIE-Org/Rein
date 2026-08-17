import koffi from "koffi"

// ---- Struct Definitions (safe to define at module level) ----
const POINT = koffi.struct("POINT", {
	x: "long",
	y: "long",
})

const RECT = koffi.struct("RECT", {
	left: "long",
	top: "long",
	right: "long",
	bottom: "long",
})

const POINTER_INFO = koffi.struct("POINTER_INFO", {
	pointerType: "uint32",
	pointerId: "uint32",
	frameId: "uint32",
	pointerFlags: "uint32",
	sourceDevice: "void *",
	hwndTarget: "void *",
	ptPixelLocation: POINT,
	ptHimetricLocation: POINT,
	ptPixelLocationRaw: POINT,
	ptHimetricLocationRaw: POINT,
	dwTime: "uint32",
	historyCount: "uint32",
	InputData: "int32",
	dwKeyStates: "uint32",
	PerformanceCount: "uint64",
	ButtonChangeType: "int32",
})

const POINTER_TOUCH_INFO = koffi.struct("POINTER_TOUCH_INFO", {
	pointerInfo: POINTER_INFO,
	touchFlags: "uint32",
	touchMask: "uint32",
	rcContact: RECT,
	rcContactRaw: RECT,
	orientation: "uint32",
	pressure: "uint32",
})

export const POINTER_TYPE_INFO = koffi.struct("POINTER_TYPE_INFO", {
	type: "uint32",
	touchInfo: POINTER_TOUCH_INFO,
})

const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
	dx: "long",
	dy: "long",
	mouseData: "uint32",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr",
})

const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
	wVk: "uint16",
	wScan: "uint16",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr",
})

const INPUT_UNION = koffi.union("INPUT_UNION", {
	mi: MOUSEINPUT,
	ki: KEYBDINPUT,
})

const INPUT = koffi.struct("INPUT", {
	type: "uint32",
	__pad: "uint32",
	u: INPUT_UNION,
})

type KoffiLib = ReturnType<typeof koffi.load>
type KoffiFunc = ReturnType<KoffiLib["func"]>
let _lib: KoffiLib | null = null
let _CreateSyntheticPointerDevice: KoffiFunc | null = null
let _InjectPointerInput: KoffiFunc | null = null
let _SendInput: KoffiFunc | null = null

function ensureLib() {
	if (!_lib) {
		_lib = koffi.load("user32.dll")

		_CreateSyntheticPointerDevice = _lib.func(
			"void * CreateSyntheticPointerDevice(uint32 pointerType, uint32 maxCount, uint32 mode)",
		)

		_InjectPointerInput = _lib.func(
			"int InjectPointerInput(void * device, const POINTER_TYPE_INFO * pointerInfo, uint32 count)",
		)

		_SendInput = _lib.func(
			"uint32 SendInput(uint32 nInputs, const INPUT * pInputs, int cbSize)",
		)
	}
}

// ---- Exports ----
export const INPUT_STRUCT_SIZE = koffi.sizeof(INPUT)

export function SendInput(
	count: number,
	events: unknown,
	size: number,
): number {
	if (count < 0 || count > 1000) {
		throw new Error(`Invalid event count: ${count}`)
	}
	if (size !== INPUT_STRUCT_SIZE) {
		throw new Error(`Size mismatch: expected ${INPUT_STRUCT_SIZE}, got ${size}`)
	}
	ensureLib()
	if (!_SendInput) {
		throw new Error("Failed to load SendInput from user32.dll")
	}
	return _SendInput(count, events, size) as number
}

export function CreateSyntheticPointerDevice(
	pointerType: number,
	maxCount: number,
	mode: number,
): unknown {
	ensureLib()
	if (!_CreateSyntheticPointerDevice) {
		throw new Error(
			"Failed to load CreateSyntheticPointerDevice from user32.dll",
		)
	}
	return _CreateSyntheticPointerDevice(pointerType, maxCount, mode)
}

export function InjectPointerInput(
	device: unknown,
	pointerInfo: unknown,
	count: number,
): number {
	if (!device) {
		throw new Error("Invalid device handle")
	}
	if (count < 0 || count > 100) {
		throw new Error(`Invalid pointer count: ${count}`)
	}
	ensureLib()
	if (!_InjectPointerInput) {
		throw new Error("Failed to load InjectPointerInput from user32.dll")
	}
	return _InjectPointerInput(device, pointerInfo, count) as number
}
