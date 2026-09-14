/**
 * macOS input injection backend using CoreGraphics.
 *
 * Provides mouse, keyboard, and touch input injection through native
 * macOS APIs. Manages cursor state, button tracking, scrolling, and
 * delegates keyboard and touch functionality to platform-specific modules.
 */
import { postMouseEvent, postScrollEvent } from "./structs.ts"
import {
	kCGEventMouseMoved,
	kCGEventLeftMouseDown,
	kCGEventLeftMouseUp,
	kCGEventRightMouseDown,
	kCGEventRightMouseUp,
	kCGEventOtherMouseDown,
	kCGEventOtherMouseUp,
	kCGEventOtherMouseDragged,
	kCGEventLeftMouseDragged,
	kCGEventRightMouseDragged,
	kCGMouseButtonLeft,
	kCGMouseButtonRight,
	kCGMouseButtonCenter,
} from "./constants.ts"
import { WHEEL_SCALE } from "../../constants.ts"
import { MacKeyboard } from "./keyboard.ts"
import { MacTouch } from "./touch.ts"
import { MacGamepad } from "./gamepad.ts"
import type { InputConfig, TouchContact } from "../../types.ts"
import { DEFAULT_CONFIG } from "../../constants.ts"

if (process.platform !== "darwin") {
	throw new Error("MacInputInjector can only be used on macOS")
}

const BUTTON_MAP = {
	left: {
		down: kCGEventLeftMouseDown,
		up: kCGEventLeftMouseUp,
		drag: kCGEventLeftMouseDragged,
		btn: kCGMouseButtonLeft,
	},
	right: {
		down: kCGEventRightMouseDown,
		up: kCGEventRightMouseUp,
		drag: kCGEventRightMouseDragged,
		btn: kCGMouseButtonRight,
	},
	middle: {
		down: kCGEventOtherMouseDown,
		up: kCGEventOtherMouseUp,
		drag: kCGEventOtherMouseDragged,
		btn: kCGMouseButtonCenter,
	},
} as const

export class MacInputInjector {
	private config: InputConfig
	private keyboard: MacKeyboard
	private touch: MacTouch
	private gamepad: MacGamepad
	private cursorX = 0
	private cursorY = 0

	private buttonsHeld = new Set<"left" | "right" | "middle">()

	constructor(config: Partial<InputConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.keyboard = new MacKeyboard()
		this.touch = new MacTouch()
		this.gamepad = new MacGamepad()
		// Seed cursor at screen centre so the first relative move is reasonable.
		this.cursorX = this.config.screenWidth / 2
		this.cursorY = this.config.screenHeight / 2
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

	//  Mouse

	injectMouseMove(dx: number, dy: number): void {
		if (dx === 0 && dy === 0) return
		this.cursorX = Math.max(
			0,
			Math.min(this.config.screenWidth, this.cursorX + dx),
		)
		this.cursorY = Math.max(
			0,
			Math.min(this.config.screenHeight, this.cursorY + dy),
		)

		let eventType = kCGEventMouseMoved
		let button = kCGMouseButtonLeft
		if (this.buttonsHeld.has("left")) {
			eventType = kCGEventLeftMouseDragged
			button = kCGMouseButtonLeft
		}
		if (this.buttonsHeld.has("right")) {
			eventType = kCGEventRightMouseDragged
			button = kCGMouseButtonRight
		}
		if (this.buttonsHeld.has("middle")) {
			eventType = kCGEventOtherMouseDragged
			button = kCGMouseButtonCenter
		}

		postMouseEvent(eventType, this.cursorX, this.cursorY, button)
	}

	injectMouseButton(
		button: "left" | "right" | "middle",
		isDown: boolean,
	): void {
		const map = BUTTON_MAP[button]
		const eventType = isDown ? map.down : map.up

		if (isDown) {
			this.buttonsHeld.add(button)
		} else {
			this.buttonsHeld.delete(button)
		}

		postMouseEvent(eventType, this.cursorX, this.cursorY, map.btn)
	}

	injectMouseWheel(dx: number, dy: number): void {
		const invert = this.config.invertScroll ? -1 : 1

		//scroll: positive deltaY = scroll up (content moves down).
		const cgDy = dy !== 0 ? Math.round(dy * invert * WHEEL_SCALE) : 0
		const cgDx = dx !== 0 ? Math.round(dx * invert * WHEEL_SCALE) : 0

		postScrollEvent(cgDx, cgDy)
	}

	// Keyboard

	injectKey(key: string, pos?: string): void {
		this.keyboard.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard.injectText(text)
	}

	// Touch

	injectTouch(contacts: TouchContact[]): void {
		this.touch.injectTouch(contacts)
	}

	// Gamepad

	injectGamepadButton(button: string, isDown: boolean): void {
		this.gamepad.injectGamepadButton(button, isDown)
	}

	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void {
		this.gamepad.injectGamepadAxis(axis, ax, ay)
	}

	// Lifecycle

	destroy(): void {
		this.touch.releaseAll()
		this.gamepad.destroy()
		this.buttonsHeld.forEach((btn) => {
			this.injectMouseButton(btn, false)
		})
		this.buttonsHeld.clear()
	}
}
