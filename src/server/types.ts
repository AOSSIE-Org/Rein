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

export interface InputMessage {
	type:
		| "move"
		| "paste"
		| "copy"
		| "click"
		| "scroll"
		| "key"
		| "text"
		| "zoom"
		| "combo"
		| "touch"
		// Gamepad: button press / release
		| "gamepad"
		// Gamepad: analog stick axis update (continuous, sent on every pointer move)
		| "gamepad-axis"
	dx?: number
	dy?: number
	config?: Partial<InputConfig>
	// mouse button (click) OR gamepad button id (gamepad)
	button?: "left" | "right" | "middle" | string
	press?: boolean
	key?: string
	keys?: string[]
	text?: string
	delta?: number
	contacts?: TouchContact[]
	// Gamepad axis: which stick and normalised -1…+1 values
	axis?: "ls" | "rs"
	ax?: number
	ay?: number
}

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
