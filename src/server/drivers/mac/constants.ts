// ── CoreGraphics Constants from @imxade/inject/mac ─────────────────────────
export {
	kCGEventNull,
	kCGEventLeftMouseDown,
	kCGEventLeftMouseUp,
	kCGEventRightMouseDown,
	kCGEventRightMouseUp,
	kCGEventMouseMoved,
	kCGEventLeftMouseDragged,
	kCGEventRightMouseDragged,
	kCGEventKeyDown,
	kCGEventKeyUp,
	kCGEventFlagsChanged,
	kCGEventScrollWheel,
	kCGEventOtherMouseDown,
	kCGEventOtherMouseUp,
	kCGEventOtherMouseDragged,
	kCGMouseButtonLeft,
	kCGMouseButtonRight,
	kCGMouseButtonCenter,
	kCGHIDEventTap,
	kCGSessionEventTap,
	kCGAnnotatedSessionEventTap,
	kCGScrollEventUnitPixel,
	kCGScrollEventUnitLine,
} from "@imxade/inject/mac"

// ── HID Report Descriptor for a standard USB Gamepad ──────────────────────
// Usage Page: Generic Desktop (0x01), Usage: Gamepad (0x05)
// - 16 buttons (1 bit each, padded to 2 bytes)
// - Left stick X/Y: 8-bit signed axes  (-127..127)
// - Right stick X/Y: 8-bit signed axes (-127..127)
// - Left trigger Z: 8-bit unsigned     (0..255)
// - Right trigger Rz: 8-bit unsigned   (0..255)
//
// Total report: 1 (id) + 2 (buttons) + 6 (axes/triggers) = 9 bytes
export const HID_REPORT_DESCRIPTOR = Buffer.from([
	0x05,
	0x01, // Usage Page (Generic Desktop)
	0x09,
	0x05, // Usage (Gamepad)
	0xa1,
	0x01, // Collection (Application)
	0x85,
	0x01, //   Report ID (1)

	// ── Buttons (16 buttons × 1 bit) ──
	0x05,
	0x09, //   Usage Page (Button)
	0x19,
	0x01, //   Usage Minimum (Button 1)
	0x29,
	0x10, //   Usage Maximum (Button 16)
	0x15,
	0x00, //   Logical Minimum (0)
	0x25,
	0x01, //   Logical Maximum (1)
	0x75,
	0x01, //   Report Size (1)
	0x95,
	0x10, //   Report Count (16)
	0x81,
	0x02, //   Input (Data, Variable, Absolute)

	// ── Left stick X / Y (8-bit signed) ──
	0x05,
	0x01, //   Usage Page (Generic Desktop)
	0x09,
	0x30, //   Usage (X)
	0x09,
	0x31, //   Usage (Y)
	// ── Right stick X / Y (8-bit signed) ──
	0x09,
	0x33, //   Usage (Rx)
	0x09,
	0x34, //   Usage (Ry)
	0x15,
	0x81, //   Logical Minimum (-127)
	0x25,
	0x7f, //   Logical Maximum (127)
	0x75,
	0x08, //   Report Size (8)
	0x95,
	0x04, //   Report Count (4)
	0x81,
	0x02, //   Input (Data, Variable, Absolute)

	// ── Left trigger Z, Right trigger Rz (8-bit unsigned) ──
	0x09,
	0x32, //   Usage (Z)
	0x09,
	0x35, //   Usage (Rz)
	0x15,
	0x00, //   Logical Minimum (0)
	0x25,
	0xff, //   Logical Maximum (255)
	0x75,
	0x08, //   Report Size (8)
	0x95,
	0x02, //   Report Count (2)
	0x81,
	0x02, //   Input (Data, Variable, Absolute)

	0xc0, // End Collection
])

// ── Button-id → bit index in the 16-bit button word ───────────────────────
export const BUTTON_BITS: Record<string, number> = {
	a: 0,
	b: 1,
	x: 2,
	y: 3,
	lb: 4,
	rb: 5,
	lt: 6, // digital press from the overlay
	rt: 7, // digital press from the overlay
	select: 8,
	start: 9,
	ls: 10,
	rs: 11,
	"dpad-up": 12,
	"dpad-down": 13,
	"dpad-left": 14,
	"dpad-right": 15,
}
