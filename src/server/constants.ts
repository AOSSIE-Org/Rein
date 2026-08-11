import type { InputConfig } from "./types.ts"

export const INPUT_MOUSE = 0
export const INPUT_KEYBOARD = 1
export const DEFAULT_SCREEN_WIDTH = 1920
export const DEFAULT_SCREEN_HEIGHT = 1080
export const WHEEL_SCALE = 3
export const PINCH_PAN_THRESHOLD = 2
export const DEFAULT_CONFIG: InputConfig = {
	sensitivity: 1.0,
	invertScroll: false,
	acceleration: true,
	screenWidth: DEFAULT_SCREEN_WIDTH,
	screenHeight: DEFAULT_SCREEN_HEIGHT,
}
export const MAX_TEXT_LENGTH = 10000
export const MAX_COORD = 2000
export const MAX_COMBO_KEYS = 10
export const MAX_KEY_LENGTH = 50

//used by utils for applying motion
export const ACCEL_THRESHOLD = 1
export const ACCEL_FACTOR = 0.8
export const ACCEL_EXPONENT = 1.2
export const ICE_PORT_MIN = 4000
export const ICE_PORT_MAX = 4050
export const RTP_HOST = "127.0.0.1"
export const RTP_PORT = 5004
