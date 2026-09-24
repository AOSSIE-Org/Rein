export interface TouchContact {
	id: number
	x: number
	y: number
	state: "down" | "move" | "up"
}

export interface InputConfig {
	sensitivity: number
	invertScroll: boolean
	acceleration: boolean
	screenWidth: number
	screenHeight: number
}

export type MouseButton = "left" | "right" | "middle"
export type GamepadButtonId =
	| "a"
	| "b"
	| "x"
	| "y"
	| "lb"
	| "rb"
	| "lt"
	| "rt"
	| "start"
	| "select"
	| "dpad-up"
	| "dpad-down"
	| "dpad-left"
	| "dpad-right"
	| "ls"
	| "rs"

type BaseMessage = {
	dx?: number
	dy?: number
	config?: Partial<InputConfig>
	key?: string
	pos?: "HOLD" | "RELEASE" | ""
	keys?: string[]
	text?: string
	delta?: number
	contacts?: TouchContact[]
	axis?: "ls" | "rs"
	ax?: number
	ay?: number
}

export type InputMessage = BaseMessage &
	(
		| { type: "move" }
		| { type: "paste" }
		| { type: "copy" }
		| { type: "click"; button: MouseButton; press: boolean }
		| { type: "scroll" }
		| { type: "key" }
		| { type: "text" }
		| { type: "zoom" }
		| { type: "combo" }
		| { type: "touch" }
		// Gamepad: button press / release
		| { type: "gamepad"; button: GamepadButtonId; press: boolean }
		// Gamepad: analog stick axis update (continuous, sent on every pointer move)
		| { type: "gamepad-axis" }
	)

export type PlatformInjector = {
	updateConfig(config: Partial<InputConfig>): void
	injectMouseMove(dx: number, dy: number): void
	injectMouseButton(button: "left" | "right" | "middle", isDown: boolean): void
	injectMouseWheel(dx: number, dy: number): void
	injectKey(key: string, pos?: string): void
	injectCombo(keys: string[]): void
	injectText(text: string): void
	injectTouch(contacts: NonNullable<InputMessage["contacts"]>): void
	injectGamepadButton(button: string, isDown: boolean): void
	injectGamepadAxis(axis: "ls" | "rs", ax: number, ay: number): void
	destroy(): void
}
