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
		| "update-settings"
	dx?: number
	dy?: number
	config?: Partial<InputConfig>
	button?: "left" | "right" | "middle"
	press?: boolean
	key?: string
	keys?: string[]
	text?: string
	delta?: number
	contacts?: TouchContact[]
}

export type PlatformInjector = {
	updateConfig(config: Partial<InputConfig>): void
	injectMouseMove(dx: number, dy: number): void
	injectMouseButton(button: "left" | "right" | "middle", isDown: boolean): void
	injectMouseWheel(dx: number, dy: number): void
	injectKey(key: string): void
	injectCombo(keys: string[]): void
	injectText(text: string): void
	injectTouch(contacts: NonNullable<InputMessage["contacts"]>): void
	destroy(): void
}
