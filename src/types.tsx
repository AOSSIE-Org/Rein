export type ModifierState = "Active" | "Release" | "Hold"

export interface GamepadState {
	leftStick: { x: number; y: number }
	rightStick: { x: number; y: number }
	buttons: {
		a: boolean
		b: boolean
		x: boolean
		y: boolean
		lb: boolean
		rb: boolean
		lt: boolean
		rt: boolean
		back: boolean
		start: boolean
		l3: boolean
		r3: boolean
		dpadUp: boolean
		dpadDown: boolean
		dpadLeft: boolean
		dpadRight: boolean
	}
}

export interface GamepadMessage {
	type: "gamepad"
	state: GamepadState
}

export type InputMessageType =
	| "move"
	| "click"
	| "scroll"
	| "key"
	| "text"
	| "zoom"
	| "combo"
	| "copy"
	| "paste"
	| "gamepad"
