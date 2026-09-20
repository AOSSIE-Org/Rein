import { describe, expect, it } from "vitest"
import {
	getConnectionMessageType,
	isNeutralGamepadAxis,
	usesUnorderedChannel,
} from "./connectionMessage"

describe("connection message routing", () => {
	it("returns a string message type only", () => {
		expect(getConnectionMessageType({ type: "move" })).toBe("move")
		expect(getConnectionMessageType({ type: 1 })).toBeNull()
		expect(getConnectionMessageType(null)).toBeNull()
	})

	it("recognizes only the terminal neutral gamepad axis", () => {
		expect(isNeutralGamepadAxis({ type: "gamepad-axis", ax: 0, ay: 0 })).toBe(
			true,
		)
		expect(isNeutralGamepadAxis({ type: "gamepad-axis", ax: 0, ay: 1 })).toBe(
			false,
		)
	})

	it("routes high-frequency messages through the unordered channel", () => {
		expect(usesUnorderedChannel({ type: "move" })).toBe(true)
		expect(usesUnorderedChannel({ type: "gamepad-axis", ax: 1, ay: 0 })).toBe(
			true,
		)
		expect(usesUnorderedChannel({ type: "gamepad-axis", ax: 0, ay: 0 })).toBe(
			false,
		)
		expect(usesUnorderedChannel({ type: "click" })).toBe(false)
	})
})
