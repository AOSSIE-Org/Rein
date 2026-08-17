import { postMouseEvent, postScrollEvent } from "./structs"
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
} from "./constants"
import { WHEEL_SCALE, DEFAULT_CONFIG } from "../constants"
import { MacKeyboard } from "./keyboard"
import { MacTouch } from "./touch"
import type {
	InputConfig,
	PlatformInjector,
	TouchContact,
	MouseButton,
} from "../types"

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

export class MacInputInjector implements PlatformInjector {
	private config: InputConfig
	private keyboard: MacKeyboard
	private touch: MacTouch
	private cursorX = 0
	private cursorY = 0
	private buttonsHeld = new Set<MouseButton>()

	constructor(config: Partial<InputConfig> = {}) {
		if (process.platform !== "darwin") {
			throw new Error("MacInputInjector can only be used on macOS")
		}
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.keyboard = new MacKeyboard()
		this.touch = new MacTouch()
		this.cursorX = this.config.screenWidth / 2
		this.cursorY = this.config.screenHeight / 2
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.config = { ...this.config, ...config }
	}

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

	injectMouseButton(button: MouseButton, isDown: boolean): void {
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

		const cgDy = dy !== 0 ? Math.round(dy * invert * WHEEL_SCALE) : 0
		const cgDx = dx !== 0 ? Math.round(dx * invert * WHEEL_SCALE) : 0

		postScrollEvent(cgDx, cgDy)
	}

	injectKey(key: string, pos?: string): void {
		this.keyboard.injectKey(key, pos ?? "")
	}

	injectCombo(keys: string[]): void {
		this.keyboard.injectCombo(keys)
	}

	injectText(text: string): void {
		this.keyboard.injectText(text)
	}

	injectTouch(contacts: TouchContact[]): void {
		this.touch.injectTouch(contacts)
	}

	destroy(): void {
		this.touch.releaseAll()
		for (const btn of this.buttonsHeld) {
			this.injectMouseButton(btn, false)
		}
		this.buttonsHeld.clear()
	}
}

export { MacKeyboard } from "./keyboard"
export { MacTouch } from "./touch"
