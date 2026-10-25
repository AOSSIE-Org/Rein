# Drivers

Cross-platform input injection layer used by the server to generate native mouse, keyboard, and touch input events on Windows, Linux, and macOS.

## Structure

### Shared Files

- **constants.ts** – Common constants used across platforms.
- **keyMap.ts** – Maps application key names to platform-specific key codes.
- **types.ts** – Shared TypeScript interfaces and type definitions.
- **utils.ts** – Utility functions for input processing and motion calculations.

### Linux (`linux/`)

Implements input injection using `@imxade/inject/linux` (**uinput** subsystem).
- **index.ts** – Main Linux input injector.
- **keyboard.ts** – Keyboard event injection.
- **touch.ts** – Multi-touch input handling using the Linux MT slot protocol.
- **gamepad.ts** – Linux virtual gamepad device injection.
- **constants.ts** – Linux-specific constants and event codes.

### macOS (`mac/`)

Implements input injection using `@imxade/inject/mac` (**CoreGraphics**) and IOHIDUserDevice.
- **index.ts** – Main macOS input injector.
- **keyboard.ts** – Keyboard, Unicode text, and media key injection.
- **touch.ts** – Touch gesture translation (drag, scroll, pinch zoom).
- **gamepad.ts** – Virtual HID gamepad device injection.
- **constants.ts** – CoreGraphics constants and event definitions.

### Windows (`windows/`)

Implements input injection using `@imxade/inject/windows` (**SendInput**, **Synthetic Pointer API**, and **ViGEmBus**).
- **index.ts** – Main Windows input injector.
- **keyboard.ts** – Keyboard and Unicode text injection.
- **touch.ts** – Synthetic multi-touch input implementation.
- **gamepad.ts** – Virtual Xbox 360 controller injection via ViGEmBus.
- **constants.ts** – Windows input constants and flags.

## Supported Input Types

- Mouse movement
- Mouse buttons
- Mouse wheel scrolling
- Keyboard input
- Key combinations
- Text injection
- Multi-touch input
- Pinch and zoom gestures
- Clipboard shortcuts (copy/paste)
