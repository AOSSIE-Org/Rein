import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	KEYEVENTF_EXTENDEDKEY,
	KEYEVENTF_KEYUP,
	KEYEVENTF_SCANCODE,
	KEYEVENTF_UNICODE,
} from "./constants.ts"

const mockSendInput = vi.fn((count: number) => count)

vi.mock("./structs.ts", () => ({
	SendInput: (...args: unknown[]) => mockSendInput(...args),
	INPUT_STRUCT_SIZE: 40,
}))

import { WindowsKeyboard } from "./keyboard.ts"

describe("WindowsKeyboard Driver Unit Tests", () => {
	let keyboard: WindowsKeyboard

	beforeEach(() => {
		mockSendInput.mockClear()
		keyboard = new WindowsKeyboard()
	})

	it("injects physical scancode with KEYEVENTF_SCANCODE when pos is HOLD", () => {
		keyboard.injectKey("w", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(1)
		expect(events).toEqual([
			{
				type: 1, // INPUT_KEYBOARD
				__pad: 0,
				u: {
					ki: {
						wVk: 0,
						wScan: 0x11, // W hardware scancode
						dwFlags: KEYEVENTF_SCANCODE,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			},
		])
	})

	it("injects key release with KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP when pos is RELEASE", () => {
		keyboard.injectKey("w", "RELEASE")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(1)
		expect(events).toEqual([
			{
				type: 1,
				__pad: 0,
				u: {
					ki: {
						wVk: 0,
						wScan: 0x11,
						dwFlags: KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
						time: 0,
						dwExtraInfo: 0,
					},
				},
			},
		])
	})

	it("injects both press and release scancodes when pos is empty", () => {
		keyboard.injectKey("w", "")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(2)
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE)
		expect(events[0].u.ki.wScan).toBe(0x11)
		expect(events[1].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP)
		expect(events[1].u.ki.wScan).toBe(0x11)
	})

	it("injects extended scancode flag for extended keys like arrowup", () => {
		keyboard.injectKey("arrowup", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(1)
		expect(events[0].u.ki.dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY,
		)
		expect(events[0].u.ki.wScan).toBe(0x48)
	})

	it("preserves KEYEVENTF_UNICODE strictly for injectText", () => {
		keyboard.injectText("a")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(2)
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_UNICODE)
		expect(events[0].u.ki.wScan).toBe("a".charCodeAt(0))
		expect(events[1].u.ki.dwFlags).toBe(KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
	})
})
