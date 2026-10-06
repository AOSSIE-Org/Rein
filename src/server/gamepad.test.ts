import type { UinputDevice } from "@imxade/inject/linux"
import { describe, expect, it, vi } from "vitest"
import { GAMEPAD_BUTTON_MAP, LinuxGamepad } from "./drivers/linux/gamepad.ts"

function createMockDevice() {
	return {
		emit: vi.fn().mockReturnThis(),
		sync: vi.fn().mockReturnThis(),
	} as unknown as UinputDevice
}

describe("LinuxGamepad", () => {
	it("should contain standard gamepad button mappings", () => {
		expect(GAMEPAD_BUTTON_MAP.a).toBe(0x130)
		expect(GAMEPAD_BUTTON_MAP.b).toBe(0x131)
		expect(GAMEPAD_BUTTON_MAP.x).toBe(0x133)
		expect(GAMEPAD_BUTTON_MAP.y).toBe(0x134)
		expect(GAMEPAD_BUTTON_MAP.lb).toBe(0x136)
		expect(GAMEPAD_BUTTON_MAP.rb).toBe(0x137)
		expect(GAMEPAD_BUTTON_MAP.lt).toBe(0x138)
		expect(GAMEPAD_BUTTON_MAP.rt).toBe(0x139)
		expect(GAMEPAD_BUTTON_MAP.select).toBe(0x13a)
		expect(GAMEPAD_BUTTON_MAP.start).toBe(0x13b)
		expect(GAMEPAD_BUTTON_MAP.ls).toBe(0x13d)
		expect(GAMEPAD_BUTTON_MAP.rs).toBe(0x13e)
		expect(GAMEPAD_BUTTON_MAP["dpad-up"]).toBe(0x220)
		expect(GAMEPAD_BUTTON_MAP["dpad-down"]).toBe(0x221)
		expect(GAMEPAD_BUTTON_MAP["dpad-left"]).toBe(0x222)
		expect(GAMEPAD_BUTTON_MAP["dpad-right"]).toBe(0x223)
	})

	it("should emit EV_KEY and sync events on button press/release", () => {
		const mockDevice = createMockDevice()
		const gamepad = new LinuxGamepad(mockDevice)

		gamepad.injectGamepadButton("a", true)

		// Expect EV_KEY press (type 1, code 0x130, value 1) and sync
		expect(mockDevice.emit).toHaveBeenCalledWith(0x01, 0x130, 1)
		expect(mockDevice.sync).toHaveBeenCalled()
	})

	it("should emit EV_ABS events for analog sticks and clamp values", () => {
		const mockDevice = createMockDevice()
		const gamepad = new LinuxGamepad(mockDevice)

		gamepad.injectGamepadAxis("ls", -1.0, 1.0)

		// ABS_X (0x00) = -32767, ABS_Y (0x01) = 32767
		expect(mockDevice.emit).toHaveBeenCalledWith(0x03, 0x00, -32767)
		expect(mockDevice.emit).toHaveBeenCalledWith(0x03, 0x01, 32767)
		expect(mockDevice.sync).toHaveBeenCalled()
	})

	it("should clamp out-of-range axis values before writing", () => {
		const mockDevice = createMockDevice()
		const gamepad = new LinuxGamepad(mockDevice)

		// Values outside [-1.0, 1.0] must clamp to -32767 and 32767
		gamepad.injectGamepadAxis("ls", -2.5, 3.5)

		expect(mockDevice.emit).toHaveBeenCalledWith(0x03, 0x00, -32767)
		expect(mockDevice.emit).toHaveBeenCalledWith(0x03, 0x01, 32767)
		expect(mockDevice.sync).toHaveBeenCalled()
	})
})
