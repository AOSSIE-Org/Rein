// ---- Event types and sync events from @imxade/inject/linux ----
export {
	EV_SYN,
	EV_KEY,
	EV_REL,
	EV_ABS,
	SYN_REPORT,
} from "@imxade/inject/linux"

export const SYN_MT_REPORT = 0x02

// ---- Relative axes (mouse movement / scroll) ----
export const REL_X = 0x00
export const REL_Y = 0x01
export const REL_WHEEL = 0x08
export const REL_HWHEEL = 0x06

// ---- Absolute axes (multitouch) ----
export const ABS_X = 0x00
export const ABS_Y = 0x01
export const ABS_MT_SLOT = 0x2f
export const ABS_MT_TRACKING_ID = 0x39
export const ABS_MT_POSITION_X = 0x35
export const ABS_MT_POSITION_Y = 0x36
export const ABS_MT_TOUCH_MAJOR = 0x30
export const ABS_MT_PRESSURE = 0x3a

// ---- Mouse buttons ----
export const BTN_LEFT = 0x110
export const BTN_RIGHT = 0x111
export const BTN_MIDDLE = 0x112

// ---- Touchpad / touch tool buttons ----
export const BTN_TOUCH = 0x14a
export const BTN_TOOL_FINGER = 0x145
export const BTN_TOOL_DOUBLETAP = 0x14d
export const BTN_TOOL_TRIPLETAP = 0x14e
export const BTN_TOOL_QUADTAP = 0x14f

// ---- Gamepad buttons ----
export const BTN_SOUTH = 0x130
export const BTN_A = 0x130
export const BTN_EAST = 0x131
export const BTN_B = 0x131
export const BTN_C = 0x132
export const BTN_NORTH = 0x133
export const BTN_X = 0x133
export const BTN_WEST = 0x134
export const BTN_Y = 0x134
export const BTN_Z = 0x135
export const BTN_TL = 0x136
export const BTN_TR = 0x137
export const BTN_TL2 = 0x138
export const BTN_TR2 = 0x139
export const BTN_SELECT = 0x13a
export const BTN_START = 0x13b
export const BTN_MODE = 0x13c
export const BTN_THUMBL = 0x13d
export const BTN_THUMBR = 0x13e

export const BTN_DPAD_UP = 0x220
export const BTN_DPAD_DOWN = 0x221
export const BTN_DPAD_LEFT = 0x222
export const BTN_DPAD_RIGHT = 0x223

// ---- Gamepad absolute axes ----
export const ABS_Z = 0x02
export const ABS_RX = 0x03
export const ABS_RY = 0x04
export const ABS_RZ = 0x05
export const ABS_HAT0X = 0x10
export const ABS_HAT0Y = 0x11

// ---- Key press states ----
export const KEY_PRESS = 1
export const KEY_RELEASE = 0
export const KEY_REPEAT = 2

// ---- Misc ----
export const MAX_CONTACTS = 10
export const MT_TRACKING_ID_RELEASED = -1
