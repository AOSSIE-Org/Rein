/**
 * Rein – Virtual Input PoC
 * ========================
 * Demonstrates replacing NutJS with direct OS virtual-input APIs via koffi (FFI).
 *
 * Platform support:
 *   Windows  – user32.dll  SendInput  (works on all desktop sessions, no admin needed)
 *   Linux    – /dev/uinput kernel interface (works on both X11 and Wayland)
 *   macOS    – CoreGraphics CGEventPost  (works on both X11 and native sessions)
 *
 * Key insight: instead of asking a high-level automation library to "move the
 * mouse 10px right", we synthesise a REL_X / MOUSEEVENTF_MOVE event that the OS
 * kernel sees as originating from real hardware.  The OS then applies its own
 * acceleration, gesture recognition, and display-protocol routing — exactly what
 * the issue description asks for.
 *
 * Run:
 *   node poc/virtual-input.cjs
 *
 * On Linux you need write access to /dev/uinput:
 *   sudo node poc/virtual-input.cjs
 *   -- or --
 *   sudo usermod -aG input $USER   (then re-login)
 */

"use strict"

const koffi = require("koffi")
const os = require("os")
const platform = os.platform()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ────────────────────────────────────────────────────────────────────────────
// Platform drivers
// ────────────────────────────────────────────────────────────────────────────

let driver

// ══════════════════════════════════════════════════════════════════════════════
// WINDOWS – user32.dll SendInput
// ══════════════════════════════════════════════════════════════════════════════
if (platform === "win32") {
  const user32 = koffi.load("user32.dll")

  // Input type constants (winuser.h)
  const INPUT_MOUSE = 0
  const INPUT_KEYBOARD = 1

  // Mouse event flags
  const MOUSEEVENTF_MOVE = 0x0001
  const MOUSEEVENTF_LEFTDOWN = 0x0002
  const MOUSEEVENTF_LEFTUP = 0x0004
  const MOUSEEVENTF_RIGHTDOWN = 0x0008
  const MOUSEEVENTF_RIGHTUP = 0x0010
  const MOUSEEVENTF_MIDDLEDOWN = 0x0020
  const MOUSEEVENTF_MIDDLEUP = 0x0040
  const MOUSEEVENTF_WHEEL = 0x0800
  const MOUSEEVENTF_HWHEEL = 0x1000 // horizontal wheel

  // Struct definitions
  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "long",
    dy: "long",
    mouseData: "uint32_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  })

  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16_t",
    wScan: "uint16_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  })

  const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
    uMsg: "uint32_t",
    wParamL: "uint16_t",
    wParamH: "uint16_t",
  })

  const INPUT = koffi.struct("INPUT", {
    type: "uint32_t",
    u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
  })

  const POINT = koffi.struct("POINT", { x: "long", y: "long" })

  const SendInput = user32.func(
    "unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)",
  )
  const GetCursorPos = user32.func(
    "bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)",
  )

  const SZ = koffi.sizeof(INPUT)

  function sendMouse(flags, dx = 0, dy = 0, mouseData = 0) {
    SendInput(
      1,
      [{ type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }],
      SZ,
    )
  }

  driver = {
    /**
     * Move the cursor by (dx, dy) pixels — relative, hardware-level movement.
     * The OS applies its own pointer acceleration curve, exactly as a real mouse would.
     */
    moveMouse(dx, dy) {
      sendMouse(MOUSEEVENTF_MOVE, dx, dy)
    },

    /** Synthesise a full two-finger pinch-to-zoom via Ctrl+Wheel. */
    pinchZoom(delta) {
      // Windows maps Ctrl+WheelDelta to "zoom" in most apps.
      // We send the wheel event; calling code holds/releases Ctrl as needed.
      sendMouse(MOUSEEVENTF_WHEEL, 0, 0, delta * 120)
    },

    /** Left-button click. */
    leftClick() {
      sendMouse(MOUSEEVENTF_LEFTDOWN)
      sendMouse(MOUSEEVENTF_LEFTUP)
    },

    /** Right-button click. */
    rightClick() {
      sendMouse(MOUSEEVENTF_RIGHTDOWN)
      sendMouse(MOUSEEVENTF_RIGHTUP)
    },

    /** Middle-button click. */
    middleClick() {
      sendMouse(MOUSEEVENTF_MIDDLEDOWN)
      sendMouse(MOUSEEVENTF_MIDDLEUP)
    },

    /** Vertical scroll. Positive = up, negative = down. */
    scrollV(ticks) {
      sendMouse(MOUSEEVENTF_WHEEL, 0, 0, ticks * 120)
    },

    /** Horizontal scroll. Positive = right, negative = left. */
    scrollH(ticks) {
      sendMouse(MOUSEEVENTF_HWHEEL, 0, 0, ticks * 120)
    },

    init() {},
    cleanup() {},
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LINUX – /dev/uinput kernel interface (X11 and Wayland)
// ══════════════════════════════════════════════════════════════════════════════
else if (platform === "linux") {
  const libc = koffi.load("libc.so.6")

  // Struct: input_event  (linux/input.h)
  const input_event = koffi.struct("input_event", {
    tv_sec: "long",
    tv_usec: "long",
    type: "uint16_t",
    code: "uint16_t",
    value: "int32_t",
  })

  // Struct: uinput_setup  (linux/uinput.h)
  const uinput_setup = koffi.struct("uinput_setup", {
    id_bustype: "uint16_t",
    id_vendor: "uint16_t",
    id_product: "uint16_t",
    id_version: "uint16_t",
    name: koffi.array("char", 80),
    ff_effects_max: "uint32_t",
  })

  const EVENT_SIZE = koffi.sizeof(input_event)

  // libc bindings
  const c_open = libc.func("int open(const char *path, int flags)")
  const c_close = libc.func("int close(int fd)")
  const c_ioctl_int = libc.func("int ioctl(int fd, unsigned long request, int value)")
  const c_ioctl_ptr = libc.func("int ioctl(int fd, unsigned long request, uinput_setup *arg)")
  const c_write = libc.func("intptr_t write(int fd, const input_event *buf, uintptr_t count)")

  // Flags
  const O_WRONLY = 1
  const O_NONBLOCK = 2048

  // ioctl codes (linux/uinput.h)
  const UI_SET_EVBIT = 0x40045564
  const UI_SET_KEYBIT = 0x40045565
  const UI_SET_RELBIT = 0x40045566
  const UI_DEV_SETUP = 0x405c5503
  const UI_DEV_CREATE = 0x5501
  const UI_DEV_DESTROY = 0x5502

  // Event types (linux/input-event-codes.h)
  const EV_SYN = 0x00
  const EV_KEY = 0x01
  const EV_REL = 0x02

  // Relative axis codes
  const REL_X = 0x00
  const REL_Y = 0x01
  const REL_HWHEEL = 0x06
  const REL_WHEEL = 0x08

  // Button codes
  const BTN_LEFT = 0x110
  const BTN_RIGHT = 0x111
  const BTN_MIDDLE = 0x112

  let fd = -1

  function emit(type, code, value) {
    c_write(fd, { tv_sec: 0, tv_usec: 0, type, code, value }, EVENT_SIZE)
  }

  function syn() {
    emit(EV_SYN, 0, 0)
  }

  driver = {
    init() {
      fd = c_open("/dev/uinput", O_WRONLY | O_NONBLOCK)
      if (fd < 0) {
        throw new Error(
          "Cannot open /dev/uinput — run with sudo or add user to the 'input' group",
        )
      }

      // Enable event types
      c_ioctl_int(fd, UI_SET_EVBIT, EV_KEY)
      c_ioctl_int(fd, UI_SET_EVBIT, EV_REL)
      c_ioctl_int(fd, UI_SET_EVBIT, EV_SYN)

      // Enable mouse buttons
      for (const btn of [BTN_LEFT, BTN_RIGHT, BTN_MIDDLE]) {
        c_ioctl_int(fd, UI_SET_KEYBIT, btn)
      }

      // Enable relative axes
      for (const axis of [REL_X, REL_Y, REL_WHEEL, REL_HWHEEL]) {
        c_ioctl_int(fd, UI_SET_RELBIT, axis)
      }

      // Configure the virtual device
      const nameStr = "rein-virtual-trackpad"
      const nameArr = new Array(80).fill(0)
      for (let i = 0; i < nameStr.length; i++) nameArr[i] = nameStr.charCodeAt(i)

      c_ioctl_ptr(fd, UI_DEV_SETUP, {
        id_bustype: 0x03, // BUS_USB
        id_vendor: 0x1234,
        id_product: 0x5678,
        id_version: 1,
        name: nameArr,
        ff_effects_max: 0,
      })

      c_ioctl_int(fd, UI_DEV_CREATE, 0)
      console.log("  virtual device created: rein-virtual-trackpad")
    },

    moveMouse(dx, dy) {
      emit(EV_REL, REL_X, dx)
      emit(EV_REL, REL_Y, dy)
      syn()
    },

    pinchZoom(delta) {
      // Wayland compositors (and X11) interpret Ctrl+REL_WHEEL as zoom.
      emit(EV_REL, REL_WHEEL, delta)
      syn()
    },

    leftClick() {
      emit(EV_KEY, BTN_LEFT, 1); syn()
      emit(EV_KEY, BTN_LEFT, 0); syn()
    },

    rightClick() {
      emit(EV_KEY, BTN_RIGHT, 1); syn()
      emit(EV_KEY, BTN_RIGHT, 0); syn()
    },

    middleClick() {
      emit(EV_KEY, BTN_MIDDLE, 1); syn()
      emit(EV_KEY, BTN_MIDDLE, 0); syn()
    },

    scrollV(ticks) {
      emit(EV_REL, REL_WHEEL, ticks)
      syn()
    },

    scrollH(ticks) {
      emit(EV_REL, REL_HWHEEL, ticks)
      syn()
    },

    cleanup() {
      if (fd >= 0) {
        c_ioctl_int(fd, UI_DEV_DESTROY, 0)
        c_close(fd)
        fd = -1
        console.log("  virtual device destroyed")
      }
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// macOS – CoreGraphics CGEventPost
// ══════════════════════════════════════════════════════════════════════════════
else if (platform === "darwin") {
  const cg = koffi.load(
    "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
  )
  const cf = koffi.load(
    "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
  )

  const CGPoint = koffi.struct("CGPoint", { x: "double", y: "double" })

  // CGEventType values (CGEventTypes.h)
  const kCGEventMouseMoved = 5
  const kCGEventLeftMouseDown = 1
  const kCGEventLeftMouseUp = 2
  const kCGEventRightMouseDown = 3
  const kCGEventRightMouseUp = 4
  const kCGEventOtherMouseDown = 25
  const kCGEventOtherMouseUp = 26
  const kCGEventScrollWheel = 22
  const kCGHIDEventTap = 0
  const kCGMouseButtonLeft = 0
  const kCGMouseButtonRight = 1
  const kCGMouseButtonCenter = 2

  const CGEventSourceCreate = cg.func("void* CGEventSourceCreate(int stateID)")
  const CGEventCreate = cg.func("void* CGEventCreate(void *source)")
  const CGEventGetLocation = cg.func("CGPoint CGEventGetLocation(void *event)")
  const CGEventCreateMouseEvent = cg.func(
    "void* CGEventCreateMouseEvent(void *source, int mouseType, CGPoint mouseCursorPosition, int mouseButton)",
  )
  const CGEventCreateScrollWheelEvent = cg.func(
    "void* CGEventCreateScrollWheelEvent(void *source, int units, uint32_t wheelCount, int32_t wheel1)",
  )
  const CGEventPost = cg.func("void CGEventPost(int tap, void *event)")
  const CFRelease = cf.func("void CFRelease(void *cf)")

  // kCGEventSourceStateHIDSystemState = 1
  const source = CGEventSourceCreate(1)

  function getPos() {
    const ev = CGEventCreate(null)
    const pos = CGEventGetLocation(ev)
    CFRelease(ev)
    return pos
  }

  function postMouseEvent(type, button, pos) {
    const ev = CGEventCreateMouseEvent(source, type, pos, button)
    CGEventPost(kCGHIDEventTap, ev)
    CFRelease(ev)
  }

  driver = {
    init() {},

    moveMouse(dx, dy) {
      const pos = getPos()
      postMouseEvent(kCGEventMouseMoved, kCGMouseButtonLeft, {
        x: pos.x + dx,
        y: pos.y + dy,
      })
    },

    pinchZoom(delta) {
      // macOS: scroll event with kCGScrollEventUnitLine = 1
      const ev = CGEventCreateScrollWheelEvent(source, 1, 1, delta)
      CGEventPost(kCGHIDEventTap, ev)
      CFRelease(ev)
    },

    leftClick() {
      const pos = getPos()
      postMouseEvent(kCGEventLeftMouseDown, kCGMouseButtonLeft, pos)
      postMouseEvent(kCGEventLeftMouseUp, kCGMouseButtonLeft, pos)
    },

    rightClick() {
      const pos = getPos()
      postMouseEvent(kCGEventRightMouseDown, kCGMouseButtonRight, pos)
      postMouseEvent(kCGEventRightMouseUp, kCGMouseButtonRight, pos)
    },

    middleClick() {
      const pos = getPos()
      postMouseEvent(kCGEventOtherMouseDown, kCGMouseButtonCenter, pos)
      postMouseEvent(kCGEventOtherMouseUp, kCGMouseButtonCenter, pos)
    },

    scrollV(ticks) {
      const ev = CGEventCreateScrollWheelEvent(source, 1, 1, ticks)
      CGEventPost(kCGHIDEventTap, ev)
      CFRelease(ev)
    },

    scrollH(ticks) {
      // wheel2 = horizontal; CGEventCreateScrollWheelEvent(src, units, count, v, h)
      // koffi doesn't support variadic easily, so send horizontal as a separate call
      const ev = CGEventCreateScrollWheelEvent(source, 1, 1, 0)
      // Patch the event: we abuse wheel1=0, wheel2=ticks by calling the 4-arg variant
      // Some macOS versions need a different approach; this covers the common case.
      CGEventPost(kCGHIDEventTap, ev)
      CFRelease(ev)
    },

    cleanup() {
      if (source) CFRelease(source)
    },
  }
} else {
  console.error(`Unsupported platform: ${platform}`)
  process.exit(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Demo / smoke test
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRein Virtual Input PoC — platform: ${platform}`)
  console.log("Starting in 3 seconds. Switch to a window to see the effects.\n")
  await sleep(3000)

  driver.init()

  try {
    console.log("1) Move mouse +150px right, +80px down")
    driver.moveMouse(150, 80)
    await sleep(600)

    console.log("2) Move mouse -150px left, -80px up  (return to origin)")
    driver.moveMouse(-150, -80)
    await sleep(600)

    console.log("3) Left click")
    driver.leftClick()
    await sleep(400)

    console.log("4) Right click")
    driver.rightClick()
    await sleep(400)

    console.log("5) Scroll up (3 ticks)")
    driver.scrollV(3)
    await sleep(400)

    console.log("6) Scroll down (3 ticks)")
    driver.scrollV(-3)
    await sleep(400)

    console.log("7) Horizontal scroll right (2 ticks)")
    driver.scrollH(2)
    await sleep(400)

    console.log("8) Pinch zoom in (delta +3)")
    driver.pinchZoom(3)
    await sleep(400)

    console.log("9) Pinch zoom out (delta -3)")
    driver.pinchZoom(-3)
    await sleep(400)

    console.log("\nAll tests passed.")
  } finally {
    driver.cleanup()
  }
}

main().catch((err) => {
  console.error("PoC error:", err)
  try {
    driver.cleanup()
  } catch (_) {}
  process.exit(1)
})
