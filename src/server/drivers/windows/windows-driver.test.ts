import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	INPUT_KEYBOARD,
	KEYEVENTF_EXTENDEDKEY,
	KEYEVENTF_KEYUP,
	KEYEVENTF_SCANCODE,
	KEYEVENTF_UNICODE,
	type WindowsInput,
} from "@imxade/inject/windows"

const mockSendInput = vi.fn((events: WindowsInput[]) => events.length)

vi.mock("@imxade/inject/windows", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@imxade/inject/windows")>()
	return {
		...actual,
		sendInput: (events: WindowsInput[]) => mockSendInput(events),
	}
})

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
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(events).toEqual([
			{
				type: INPUT_KEYBOARD,
				u: {
					ki: {
						wVk: 0,
						wScan: 0x11, // W hardware scancode
						dwFlags: KEYEVENTF_SCANCODE,
					},
				},
			},
		])
	})

	it("injects key release with KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP when pos is RELEASE", () => {
		keyboard.injectKey("w", "RELEASE")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(events).toEqual([
			{
				type: INPUT_KEYBOARD,
				u: {
					ki: {
						wVk: 0,
						wScan: 0x11,
						dwFlags: KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
					},
				},
			},
		])
	})

	it("injects both press and release scancodes when pos is empty", () => {
		keyboard.injectKey("w", "")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(2)
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE)
		expect(events[0].u.ki.wScan).toBe(0x11)
		expect(events[1].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP)
		expect(events[1].u.ki.wScan).toBe(0x11)
	})

	it("injects extended scancode flag for extended keys like arrowup", () => {
		keyboard.injectKey("arrowup", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(events[0].u.ki.dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY,
		)
		expect(events[0].u.ki.wScan).toBe(0x48)
	})

	it("injects physical scancode for punctuation keys like period", () => {
		keyboard.injectKey(".", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(events[0].u.ki.wScan).toBe(0x34) // scancode for '.'
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_SCANCODE)
	})

	it("injects key combos using virtual keys in order and releases in reverse order", () => {
		keyboard.injectCombo(["control", "arrowup"])

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(4)

		// Press control (VK 0x11, standard virtual key for OS shortcut handling)
		expect(events[0].u.ki.wVk).toBe(0x11)
		expect(events[0].u.ki.wScan).toBe(0)
		expect(events[0].u.ki.dwFlags).toBe(0)

		// Press arrowup (VK 0x26, extended)
		expect(events[1].u.ki.wVk).toBe(0x26)
		expect(events[1].u.ki.wScan).toBe(0)
		expect(events[1].u.ki.dwFlags).toBe(KEYEVENTF_EXTENDEDKEY)

		// Release arrowup in reverse order
		expect(events[2].u.ki.wVk).toBe(0x26)
		expect(events[2].u.ki.wScan).toBe(0)
		expect(events[2].u.ki.dwFlags).toBe(KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP)

		// Release control
		expect(events[3].u.ki.wVk).toBe(0x11)
		expect(events[3].u.ki.wScan).toBe(0)
		expect(events[3].u.ki.dwFlags).toBe(KEYEVENTF_KEYUP)
	})

	it("preserves KEYEVENTF_UNICODE strictly for injectText", () => {
		keyboard.injectText("a")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(2)
		expect(events[0].u.ki.dwFlags).toBe(KEYEVENTF_UNICODE)
		expect(events[0].u.ki.wScan).toBe("a".charCodeAt(0))
		expect(events[1].u.ki.dwFlags).toBe(KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
	})
})
