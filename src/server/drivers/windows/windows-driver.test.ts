import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	KEYEVENTF_EXTENDEDKEY,
	KEYEVENTF_KEYUP,
	KEYEVENTF_SCANCODE,
	KEYEVENTF_UNICODE,
} from "./constants.ts"

type SendInputEvent = {
	type: number
	__pad?: number
	u: {
		ki: {
			wVk: number
			wScan: number
			dwFlags: number
			time: number
			dwExtraInfo: number
		}
	}
}

const mockSendInput = vi.fn(
	(count: number, _events: SendInputEvent[], _size: number) => count,
)

vi.mock("./structs.ts", () => ({
	SendInput: (count: number, events: SendInputEvent[], size: number) =>
		mockSendInput(count, events, size),
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

	it("injects physical scancode for punctuation keys like period", () => {
		keyboard.injectKey(".", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(1)
		expect(events[0].u.ki.wScan).toBe(0x34) // scancode for '.'
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE)
	})

	it("injects key combos in order and releases in reverse order with scancodes and extended flags", () => {
		keyboard.injectCombo(["control", "arrowup"])

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [count, events] = mockSendInput.mock.calls[0]
		expect(count).toBe(4)

		// Press control (scancode 0x1d)
		expect(events[0].u.ki.wScan).toBe(0x1d)
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE)

		// Press arrowup (scancode 0x48, extended)
		expect(events[1].u.ki.wScan).toBe(0x48)
		expect(events[1].u.ki.dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY,
		)

		// Release arrowup in reverse order
		expect(events[2].u.ki.wScan).toBe(0x48)
		expect(events[2].u.ki.dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
		)

		// Release control
		expect(events[3].u.ki.wScan).toBe(0x1d)
		expect(events[3].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP)
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
