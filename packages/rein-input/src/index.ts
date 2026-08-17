/**
 * @aossie/rein-input
 * Cross-platform native input injection library using Koffi FFI.
 */

export * from "./types"
export * from "./constants"
export * from "./keyMap"
export * from "./utils"
export * from "./factory"

// Platform-specific injectors & components
export { WindowsInputInjector, WindowsKeyboard, WindowsTouch } from "./windows"
export { LinuxInputInjector, LinuxKeyboard, LinuxTouch } from "./linux"
export { MacInputInjector, MacKeyboard, MacTouch } from "./mac"
