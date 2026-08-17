# @aossie/rein-input

[![npm version](https://img.shields.io/npm/v/@aossie/rein-input.svg)](https://www.npmjs.com/package/@aossie/rein-input)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Cross-platform native input injection library for Node.js and Electron using [Koffi](https://koffi.dev/) FFI.

Part of the [Rein](https://github.com/AOSSIE-Org/Rein) remote input and screen mirror ecosystem under [AOSSIE](https://aossie.org).

---

## ✨ Features

- ⚡ **Zero-addon Compilation**: Uses Koffi FFI to bind directly to native OS C APIs without requiring `node-gyp` or native C++ compilation toolchains.
- 🚀 **High Performance & Low Latency**: Sub-millisecond event dispatch suitable for real-time remote control, WebRTC streaming, trackpad emulation, and cloud gaming interfaces.
- 🖥️ **True Cross-Platform Support**:
  - **Linux**: Virtual mouse, keyboard, and multitouch devices via the kernel **uinput** subsystem (MT slot protocol B).
  - **macOS**: Native mouse, scrolling, keyboard, and gesture simulation via **CoreGraphics** APIs with Unicode character fallback.
  - **Windows**: High-precision mouse and keyboard injection via Win32 **SendInput** and multitouch via the **Synthetic Pointer API**.
- 🖱️ **Full Input Capabilities**:
  - Mouse movement (relative delta, absolute tracking, acceleration curves, sensitivity tuning).
  - Mouse buttons (left, right, middle, drag & hold states).
  - High-resolution vertical and horizontal mouse wheel scrolling with inversion support.
  - Key presses, releases, and key combinations (`Ctrl+C`, `Cmd+V`, `Alt+Tab`, etc.).
  - Full Unicode text injection for arbitrary character sets and emoji.
  - Multitouch contacts tracking, pinch-to-zoom, and multi-finger pan gestures.
- 📦 **Dual Module Distribution**: First-class support for both ECMAScript Modules (ESM) and CommonJS (CJS) with bundled TypeScript declarations (`.d.ts`).

---

## 📦 Installation

Install `@aossie/rein-input` along with its peer dependency `koffi`:

```bash
npm install @aossie/rein-input koffi
```

or with yarn / pnpm:

```bash
yarn add @aossie/rein-input koffi
# or
pnpm add @aossie/rein-input koffi
```

---

## 🚀 Quick Start

### Universal Factory (`createInputInjector`)

The `createInputInjector` function automatically detects the host operating system (`win32`, `linux`, `darwin`) and instantiates the appropriate native driver:

```typescript
import { createInputInjector } from "@aossie/rein-input"

// Initialize with custom screen dimensions and sensitivity
const injector = createInputInjector({
  sensitivity: 1.2,
  acceleration: true,
  invertScroll: false,
  screenWidth: 1920,
  screenHeight: 1080,
})

// 1. Mouse movement (relative coordinates)
injector.injectMouseMove(25, -10)

// 2. Mouse click
injector.injectMouseButton("left", true)  // Press down
injector.injectMouseButton("left", false) // Release

// 3. Mouse wheel scroll (horizontal dx, vertical dy)
injector.injectMouseWheel(0, 5)

// 4. Keyboard key press
injector.injectKey("enter")

// 5. Key combinations
injector.injectCombo(["control", "c"]) // or ["meta", "c"] on macOS

// 6. Direct text injection
injector.injectText("Hello from Rein!")

// 7. Cleanup on exit
injector.destroy()
```

---

## 📱 Multitouch & Gestures

Inject multi-contact touch events for trackpads and touchscreen devices:

```typescript
import { createInputInjector } from "@aossie/rein-input"

const injector = createInputInjector()

// Multi-finger touch contact frame
injector.injectTouch([
  { id: 0, x: 500, y: 400, state: "down" },
  { id: 1, x: 550, y: 400, state: "down" },
])

// Move contacts (pan / scroll / pinch)
injector.injectTouch([
  { id: 0, x: 510, y: 410, state: "move" },
  { id: 1, x: 570, y: 420, state: "move" },
])

// Lift contacts
injector.injectTouch([
  { id: 0, x: 510, y: 410, state: "up" },
  { id: 1, x: 570, y: 420, state: "up" },
])
```

---

## 🛠️ Direct Platform Classes

You can also directly instantiate platform-specific injector classes if required:

```typescript
import {
  WindowsInputInjector,
  LinuxInputInjector,
  MacInputInjector,
} from "@aossie/rein-input"

// On Windows:
const winInjector = new WindowsInputInjector({ sensitivity: 1.0 })

// On Linux:
const linuxInjector = new LinuxInputInjector({ screenWidth: 1920, screenHeight: 1080 })

// On macOS:
const macInjector = new MacInputInjector()
```

---

## 🎛️ API Reference

### `createInputInjector(options?)`

Creates and initializes a cross-platform input injector.

#### Options (`CreateInjectorOptions` or `Partial<InputConfig>`):
- `sensitivity` (`number`): Cursor speed multiplier (default: `1.0`).
- `invertScroll` (`boolean`): Inverts vertical and horizontal scroll directions (default: `false`).
- `acceleration` (`boolean`): Enables non-linear motion acceleration curve (default: `true`).
- `screenWidth` (`number`): Target desktop display width in pixels (default: `1920`).
- `screenHeight` (`number`): Target desktop display height in pixels (default: `1080`).
- `platform` (`NodeJS.Platform`): Optional override for OS detection (`"win32" | "linux" | "darwin"`).
- `onError` (`(type: string, msg: string) => void`): Callback invoked on initialization or runtime errors.

### `PlatformInjector` Interface

| Method | Description |
|---|---|
| `injectMouseMove(dx: number, dy: number)` | Injects relative cursor movement |
| `injectMouseButton(button: "left" \| "right" \| "middle", isDown: boolean)` | Injects mouse button press or release |
| `injectMouseWheel(dx: number, dy: number)` | Injects horizontal (`dx`) and vertical (`dy`) wheel scroll |
| `injectKey(key: string, pos?: string)` | Injects single key event (`"HOLD"`, `"RELEASE"`, or press+release) |
| `injectCombo(keys: string[])` | Injects atomic key combination (`["control", "alt", "delete"]`) |
| `injectText(text: string)` | Injects string of characters (Unicode supported) |
| `injectTouch(contacts: TouchContact[])` | Injects multi-touch contacts frame |
| `updateConfig(config: Partial<InputConfig>)` | Updates runtime sensitivity, scroll inversion, and screen bounds |
| `destroy()` | Releases held buttons, touches, and native driver handles |

### Utilities & Keymaps

- `applyMotion(dx, dy, config)`: Computes accelerated coordinate deltas based on velocity threshold and non-linear power curve.
- `resolveChar(ch, keyMap)`: Translates a character into its platform virtual key code and shift state.
- `VK_MAP`: Virtual key codes for Windows SendInput.
- `LINUX_KEY_MAP`: Linux input event codes (`linux/input-event-codes.h`).
- `MAC_KEY_MAP`: macOS virtual key codes (`HIToolbox/Events.h`).
- `SHIFTED_CHARS`: Mapping of US keyboard shifted symbols (`!` -> `1`, `@` -> `2`, etc.).

---

## 🔒 Platform Permissions & Setup

### 🐧 Linux
Linux requires access to the `/dev/uinput` kernel device. Create a udev rule to allow non-root access:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-rein.rules
sudo usermod -a -G input $USER
# Log out and log back in for group changes to take effect
```

### 🍎 macOS
macOS requires **Accessibility** permissions to inject system-wide input events via CoreGraphics:
1. Open **System Settings** > **Privacy & Security** > **Accessibility**.
2. Enable your terminal or application (e.g. `Terminal`, `iTerm2`, `Electron`, or `Node`).

### 🪟 Windows
Windows requires no special kernel drivers. Multitouch features use the Windows Synthetic Pointer API available in Windows 8 and later.

---

## 📄 License

Apache-2.0 © [AOSSIE](https://aossie.org)
