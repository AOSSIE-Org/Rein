/**
 * macOS virtual gamepad implementation using IOHIDUserDevice (IOKit).
 *
 * Creates a virtual HID gamepad device via the IOHIDUserDevice API, which is
 * available in userspace on macOS 10.15+ without a kernel extension. The device
 * exposes a standard USB HID Gamepad descriptor (Usage Page 0x01, Usage 0x05)
 * with two analog sticks, two triggers, and the standard Xbox-layout buttons.
 *
 * The driver calls IOHIDUserDeviceCreate() to register the virtual device with
 * the HID subsystem, then IOHIDUserDeviceHandleReport() to push HID reports
 * whenever button or axis state changes.
 *
 * Requires: macOS 10.15+ (Catalina). No kernel extension needed.
 */
import koffi from "koffi"
import { BUTTON_BITS, HID_REPORT_DESCRIPTOR } from "./constants"

//IOKit/HID framework paths
const IOKIT_PATH = "/System/Library/Frameworks/IOKit.framework/IOKit"
const CF_PATH =
	"/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"

type KoffiLib = ReturnType<typeof koffi.load>
type KoffiFunc = ReturnType<KoffiLib["func"]>

let _cf: KoffiLib | null = null
let _iokit: KoffiLib | null = null
let _CFDictionaryCreateMutable: KoffiFunc | null = null
let _CFDictionaryAddValue: KoffiFunc | null = null
let _CFNumberCreate: KoffiFunc | null = null
let _CFDataCreate: KoffiFunc | null = null
let _CFRelease: KoffiFunc | null = null
let _IOHIDUserDeviceCreate: KoffiFunc | null = null
let _IOHIDUserDeviceHandleReport: KoffiFunc | null = null

function ensureFunctions(): boolean {
	if (_iokit) return true
	try {
		_cf = koffi.load(CF_PATH)
		_iokit = koffi.load(IOKIT_PATH)

		_CFDictionaryCreateMutable = _cf.func(
			"void * CFDictionaryCreateMutable(void *allocator, int capacity, const void *keyCallBacks, const void *valueCallBacks)",
		)
		_CFDictionaryAddValue = _cf.func(
			"void CFDictionaryAddValue(void *theDict, const void *key, const void *value)",
		)
		// kCFNumberIntType = 9 (int), kCFNumberSInt32Type = 3
		_CFNumberCreate = _cf.func(
			"void * CFNumberCreate(void *allocator, int theType, const int *valuePtr)",
		)
		_CFDataCreate = _cf.func(
			"void * CFDataCreate(void *allocator, const uint8 *bytes, int length)",
		)
		_CFRelease = _cf.func("void CFRelease(void *cf)")

		_IOHIDUserDeviceCreate = _iokit.func(
			"void * IOHIDUserDeviceCreate(void *allocator, void *properties)",
		)
		_IOHIDUserDeviceHandleReport = _iokit.func(
			"int IOHIDUserDeviceHandleReport(void *device, const uint8 *report, int reportLength)",
		)
		return true
	} catch (err) {
		console.warn("[MacGamepad] Failed to load IOKit/CoreFoundation:", err)
		return false
	}
}

const kCFAllocatorDefault = 0 // NULL pointer = kCFAllocatorDefault
const kCFNumberSInt32Type = 3

function cfNumber(value: number): unknown {
	const buf = Buffer.alloc(4)
	buf.writeInt32LE(value, 0)
	return _CFNumberCreate?.(kCFAllocatorDefault, kCFNumberSInt32Type, buf)
}

// Build a minimal CFDictionary with IOHIDUserDevice creation properties.
// Returns a CF opaque pointer (void*) or null on failure.
function buildDeviceProperties(): unknown {
	if (!_CFDictionaryCreateMutable || !_CFDictionaryAddValue || !_CFDataCreate)
		return null

	// kCFTypeDictionaryKeyCallBacks / kCFTypeDictionaryValueCallBacks live in
	// CoreFoundation's __DATA segment at known symbol addresses. We can pass 0
	// (null) here safely for a temporary dictionary used only for device creation.
	const dict = _CFDictionaryCreateMutable(
		kCFAllocatorDefault,
		0,
		0,
		0,
	) as unknown

	if (!dict) return null

	// ReportDescriptor
	const descData = _CFDataCreate?.(
		kCFAllocatorDefault,
		HID_REPORT_DESCRIPTOR,
		HID_REPORT_DESCRIPTOR.length,
	)
	// VendorID: 0x045E (Microsoft), ProductID: 0x028E (Xbox 360 Controller)
	const vendorNum = cfNumber(0x045e)
	const productNum = cfNumber(0x028e)
	const versionNum = cfNumber(0x0110)

	// Key strings are passed as raw C-string pointers; IOKit resolves them
	// internally against its own CFSTR table. We encode them as koffi strings.
	if (descData) _CFDictionaryAddValue?.(dict, "ReportDescriptor", descData)
	if (vendorNum) _CFDictionaryAddValue?.(dict, "VendorID", vendorNum)
	if (productNum) _CFDictionaryAddValue?.(dict, "ProductID", productNum)
	if (versionNum) _CFDictionaryAddValue?.(dict, "VersionNumber", versionNum)

	return dict
}

export class MacGamepad {
	private device: unknown = null
	private available = false
	private report = Buffer.alloc(9, 0)
	private buttons = 0
	constructor() {
		if (!ensureFunctions()) return

		try {
			const props = buildDeviceProperties()
			if (!props) {
				console.warn(
					"[MacGamepad] Failed to build device properties dictionary",
				)
				return
			}

			this.device = _IOHIDUserDeviceCreate?.(kCFAllocatorDefault, props)
			if (_CFRelease) _CFRelease(props)

			if (!this.device) {
				console.warn(
					"[MacGamepad] IOHIDUserDeviceCreate() returned null — " +
						"ensure the process has Input Monitoring permission",
				)
				return
			}

			// Report ID = 1
			this.report[0] = 0x01
			this.available = true
			// Push a zeroed initial report to register the device
			this.flush()
			console.log(
				"[MacGamepad] Virtual HID gamepad registered via IOHIDUserDevice",
			)
		} catch (err) {
			console.warn("[MacGamepad] Initialization error:", err)
		}
	}

	injectGamepadButton(button: string, isDown: boolean): void {
		if (!this.available) return
		const lowerBtn = button.toLowerCase()

		const bit = BUTTON_BITS[lowerBtn]
		if (bit !== undefined) {
			if (isDown) {
				this.buttons |= 1 << bit
			} else {
				this.buttons &= ~(1 << bit)
			}
			// Store button word little-endian in bytes 1-2
			this.report.writeUInt16LE(this.buttons & 0xffff, 1)
		} else if (lowerBtn === "lt") {
			this.report[7] = isDown ? 255 : 0
		} else if (lowerBtn === "rt") {
			this.report[8] = isDown ? 255 : 0
		} else {
			console.warn("[MacGamepad] Unknown gamepad button:", button)
			return
		}

		this.flush()
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		if (!this.available) return
		const clamp = (v: number) =>
			Math.max(-127, Math.min(127, Math.round(v * 127)))
		const intX = clamp(ax)
		// HID Y-axis convention: +127 = up, so invert ay
		const intY = clamp(-ay)

		if (axis === "ls") {
			this.report.writeInt8(intX, 3)
			this.report.writeInt8(intY, 4)
		} else {
			this.report.writeInt8(intX, 5)
			this.report.writeInt8(intY, 6)
		}

		this.flush()
	}

	destroy(): void {
		if (!this.available || !this.device) return
		try {
			// Zero out all inputs before releasing
			this.report.fill(0)
			this.report[0] = 0x01
			this.flush()
			if (_CFRelease) _CFRelease(this.device)
		} catch (err) {
			console.warn("[MacGamepad] Error during cleanup:", err)
		}
		this.device = null
		this.available = false
	}

	private flush(): void {
		if (!this.device) return
		try {
			_IOHIDUserDeviceHandleReport?.(
				this.device,
				this.report,
				this.report.length,
			)
		} catch (err) {
			console.warn("[MacGamepad] Error sending HID report:", err)
		}
	}
}
