// ---- Event types ----
export const EV_SYN = 0x00
export const EV_KEY = 0x01
export const EV_REL = 0x02
export const EV_ABS = 0x03

// ---- Sync events ----
export const SYN_REPORT = 0x00
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

// ---- Key press states ----
export const KEY_PRESS = 1
export const KEY_RELEASE = 0
export const KEY_REPEAT = 2

// ---- uinput ioctl codes (from linux/uinput.h) ----
// Computed as: _IOW('U', n, int) = 0x40045500 | n   (sizeof int = 4)
export const UI_SET_EVBIT = 0x40045564 // _IOW('U', 100, int)
export const UI_SET_KEYBIT = 0x40045565 // _IOW('U', 101, int)
export const UI_SET_RELBIT = 0x40045566 // _IOW('U', 102, int)
export const UI_SET_ABSBIT = 0x40045567 // _IOW('U', 103, int)
// _IOW('U', 3, uinput_setup)  — sizeof(uinput_setup) = 92 (0x5c)
export const UI_DEV_SETUP = 0x405c5503
// _IOW('U', 4, uinput_abs_setup) — sizeof(uinput_abs_setup) = 24 (0x18)
export const UI_ABS_SETUP = 0x40186504
// _IO('U', 1) / _IO('U', 2)
export const UI_DEV_CREATE = 0x5501
export const UI_DEV_DESTROY = 0x5502

// ---- Misc ----
export const MAX_CONTACTS = 10
export const MT_TRACKING_ID_RELEASED = -1
export const UINPUT_PATH = "/dev/uinput"
export const UINPUT_MAX_NAME_SIZE = 80
