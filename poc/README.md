# Virtual Input PoC — Issue #130

This directory contains a self-contained Proof of Concept that demonstrates
replacing NutJS mouse input with direct OS-native virtual input APIs via
[`koffi`](https://koffi.dev/) (Node.js FFI).

---

## Why this approach

NutJS synthesises input events at the **application layer** (X11, AT-SPI, etc.)
which means:

- Wayland compositors often reject or ignore them
- The OS acceleration curve and gesture recognition are bypassed
- Some secure desktops block application-level injection entirely

By calling the OS virtual-input API directly, events enter the kernel's **input
pipeline** as if they came from real hardware. The OS then applies its own
acceleration, routes gestures to the correct window, and works on all display
protocols (X11, Wayland, native Windows/macOS sessions).

---

## Architecture

```
Mobile phone (Rein client)
        |
        | WebSocket message  { type: "move", dx: 5, dy: 3 }
        v
  InputHandler.ts              <── receives & validates the message
        |
        | this.vi.moveMouse(dx, dy)
        v
  VirtualInput.ts              <── platform factory (createVirtualInput())
        |
        |-- Windows  --> user32.dll  SendInput(MOUSEEVENTF_MOVE)
        |-- Linux    --> /dev/uinput  write(EV_REL | REL_X, REL_Y)
        `-- macOS    --> CoreGraphics  CGEventPost(kCGEventMouseMoved)
                                              |
                                              v
                                     OS kernel input pipeline
                                     (pointer acceleration, gesture
                                      recognition, display-protocol routing)
```

The PoC (`virtual-input.cjs`) exercises the bottom two layers — koffi FFI +
OS API — without the WebSocket stack, so it can be evaluated in isolation.

---

## Files

| File | Purpose |
|---|---|
| `poc/virtual-input.cjs` | Standalone demo — run directly with `node` |
| `src/server/VirtualInput.ts` | Production TypeScript driver (same logic, typed) |
| `src/server/InputHandler.ts` | Integration — wires WebSocket messages → VirtualInput |

---

## Quick start

```bash
# Install dependencies (only needed once)
npm install

# Run the PoC — it will pause 3 s then move/click/scroll your real cursor
node poc/virtual-input.cjs
```

Expected output:

```
Rein Virtual Input PoC — platform: win32
Starting in 3 seconds. Switch to a window to see the effects.

1) Move mouse +150px right, +80px down
2) Move mouse -150px left, -80px up  (return to origin)
3) Left click
4) Right click
5) Scroll up (3 ticks)
6) Scroll down (3 ticks)
7) Horizontal scroll right (2 ticks)
8) Pinch zoom in (delta +3)
9) Pinch zoom out (delta -3)

All tests passed.
```

### Linux

```bash
# Option A — run as root
sudo node poc/virtual-input.cjs

# Option B — add your user to the input group (requires re-login)
sudo usermod -aG input $USER
node poc/virtual-input.cjs
```

### macOS

```bash
node poc/virtual-input.cjs
# macOS may prompt for Accessibility permissions on first run
```

---

## What the PoC proves

| Operation | Windows | Linux | macOS |
|---|---|---|---|
| Relative mouse move | `MOUSEEVENTF_MOVE` | `EV_REL REL_X/Y` | `kCGEventMouseMoved` |
| Left / right / middle click | `MOUSEEVENTF_LEFT/RIGHT/MIDDLEDOWN/UP` | `EV_KEY BTN_LEFT/RIGHT/MIDDLE` | `kCGEventLeftMouseDown/Up` |
| Press-only / release-only (drag) | same flags, split | same codes, split | same, split |
| Vertical scroll | `MOUSEEVENTF_WHEEL` | `EV_REL REL_WHEEL` | `CGEventCreateScrollWheelEvent` wheel1 |
| Horizontal scroll | `MOUSEEVENTF_HWHEEL` | `EV_REL REL_HWHEEL` | `CGEventCreateScrollWheelEvent` wheel2 |
| Pinch zoom | `Ctrl` + `MOUSEEVENTF_WHEEL` | `Ctrl` + `REL_WHEEL` | `Ctrl` + `CGEventScrollWheel` |

---

## How it differs from NutJS

| | NutJS | This PoC |
|---|---|---|
| Layer | Application (X11 / AT-SPI / Windows UI Automation) | Kernel (uinput / SendInput / CGEventPost) |
| Wayland support | No | Yes (`/dev/uinput` works on any compositor) |
| OS acceleration curve | Bypassed | Applied (OS treats events as hardware) |
| Admin rights needed | No | No on Windows/macOS; `input` group on Linux |
| Dependency | `@nut-tree-fork/nut-js` (large native module) | `koffi` (lightweight FFI) |

---

## Tested on

- Windows 10 — all 9 operations confirmed working (`node poc/virtual-input.cjs`)
