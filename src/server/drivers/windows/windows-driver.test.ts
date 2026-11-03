import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	INPUT_KEYBOARD,
	KEYEVENTF_EXTENDEDKEY,
	KEYEVENTF_KEYUP,
	KEYEVENTF_SCANCODE,
	KEYEVENTF_UNICODE,
	type WindowsInput,
	type WindowsKeyboardInput,
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

function getKeyboardInput(event: WindowsInput): WindowsKeyboardInput {
	expect("ki" in event.u).toBe(true)
	if (!("ki" in event.u)) {
		throw new Error("Expected keyboard input event")
	}
	return event.u.ki
}

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
		expect(getKeyboardInput(events[0]).dwFlags).toBe(KEYEVENTF_SCANCODE)
		expect(getKeyboardInput(events[0]).wScan).toBe(0x11)
		expect(getKeyboardInput(events[1]).dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
		)
		expect(getKeyboardInput(events[1]).wScan).toBe(0x11)
	})

	it("injects extended scancode flag for extended keys like arrowup", () => {
		keyboard.injectKey("arrowup", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(getKeyboardInput(events[0]).dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY,
		)
		expect(getKeyboardInput(events[0]).wScan).toBe(0x48)
	})

	it("injects physical scancode for punctuation keys like period", () => {
		keyboard.injectKey(".", "HOLD")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(1)
		expect(getKeyboardInput(events[0]).wScan).toBe(0x34) // scancode for '.'
		expect(getKeyboardInput(events[0]).dwFlags).toBe(KEYEVENTF_SCANCODE)
	})

	it("injects key combos using virtual keys in order and releases in reverse order", () => {
		keyboard.injectCombo(["control", "arrowup"])

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(4)

		// Press control (VK 0x11, standard virtual key for OS shortcut handling)
		expect(getKeyboardInput(events[0]).wVk).toBe(0x11)
		expect(getKeyboardInput(events[0]).wScan).toBe(0)
		expect(getKeyboardInput(events[0]).dwFlags).toBe(0)

		// Press arrowup (VK 0x26, extended)
		expect(getKeyboardInput(events[1]).wVk).toBe(0x26)
		expect(getKeyboardInput(events[1]).wScan).toBe(0)
		expect(getKeyboardInput(events[1]).dwFlags).toBe(KEYEVENTF_EXTENDEDKEY)

		// Release arrowup in reverse order
		expect(getKeyboardInput(events[2]).wVk).toBe(0x26)
		expect(getKeyboardInput(events[2]).wScan).toBe(0)
		expect(getKeyboardInput(events[2]).dwFlags).toBe(
			KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
		)

		// Release control
		expect(getKeyboardInput(events[3]).wVk).toBe(0x11)
		expect(getKeyboardInput(events[3]).wScan).toBe(0)
		expect(getKeyboardInput(events[3]).dwFlags).toBe(KEYEVENTF_KEYUP)
	})

	it("preserves KEYEVENTF_UNICODE strictly for injectText", () => {
		keyboard.injectText("a")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(2)
		expect(getKeyboardInput(events[0]).dwFlags).toBe(KEYEVENTF_UNICODE)
		expect(getKeyboardInput(events[0]).wScan).toBe("a".charCodeAt(0))
		expect(getKeyboardInput(events[1]).dwFlags).toBe(
			KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
		)
	})

	it("injects surrogate pairs correctly for emojis without dropping low surrogate", () => {
		// "🚀" (U+1F680) is represented in UTF-16 by surrogate pair: 0xD83D (55357) and 0xDE80 (56960)
		keyboard.injectText("🚀")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		expect(events.length).toBe(4)

		// High surrogate press and release
		expect(getKeyboardInput(events[0]).dwFlags).toBe(KEYEVENTF_UNICODE)
		expect(getKeyboardInput(events[0]).wScan).toBe(0xd83d)
		expect(getKeyboardInput(events[1]).dwFlags).toBe(
			KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
		)
		expect(getKeyboardInput(events[1]).wScan).toBe(0xd83d)

		// Low surrogate press and release
		expect(getKeyboardInput(events[2]).dwFlags).toBe(KEYEVENTF_UNICODE)
		expect(getKeyboardInput(events[2]).wScan).toBe(0xde80)
		expect(getKeyboardInput(events[3]).dwFlags).toBe(
			KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
		)
		expect(getKeyboardInput(events[3]).wScan).toBe(0xde80)
	})

	it("batches all events for multi-character mixed text in a single sendInput call", () => {
		keyboard.injectText("Hi 🎮")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
		const [events] = mockSendInput.mock.calls[0]
		// 'H' (2), 'i' (2), ' ' (2), '🎮' surrogate pair (4) = 10 events total
		expect(events.length).toBe(10)

		expect(getKeyboardInput(events[0]).wScan).toBe("H".charCodeAt(0))
		expect(getKeyboardInput(events[2]).wScan).toBe("i".charCodeAt(0))
		expect(getKeyboardInput(events[4]).wScan).toBe(" ".charCodeAt(0))
		expect(getKeyboardInput(events[6]).wScan).toBe("🎮".charCodeAt(0)) // high surrogate
		expect(getKeyboardInput(events[8]).wScan).toBe("🎮".charCodeAt(1)) // low surrogate
	})

	it("splits text producing > 1000 events into batches of at most 1000 events", () => {
		// 501 BMP characters = 1002 events -> batch 1: 1000 events (500 chars), batch 2: 2 events (1 char)
		const longText = "a".repeat(501)
		keyboard.injectText(longText)

		expect(mockSendInput).toHaveBeenCalledTimes(2)
		const [batch1] = mockSendInput.mock.calls[0]
		const [batch2] = mockSendInput.mock.calls[1]

		expect(batch1.length).toBe(1000)
		expect(batch2.length).toBe(2)
	})

	it("keeps surrogate pairs together across batch boundaries without splitting", () => {
		// 499 BMP characters (998 events) + 1 emoji (4 events) = 1002 events
		// Batch 1 should hold the 998 events (499 BMP chars)
		// Batch 2 should hold the complete 4 events of the emoji (surrogate pair)
		const text = `${"a".repeat(499)}🚀`
		keyboard.injectText(text)

		expect(mockSendInput).toHaveBeenCalledTimes(2)
		const [batch1] = mockSendInput.mock.calls[0]
		const [batch2] = mockSendInput.mock.calls[1]

		expect(batch1.length).toBe(998)
		expect(batch2.length).toBe(4)

		// Verify batch 2 contains both surrogate units in sequence
		expect(getKeyboardInput(batch2[0]).wScan).toBe(0xd83d)
		expect(getKeyboardInput(batch2[2]).wScan).toBe(0xde80)
	})

	it("handles empty or falsy text without invoking sendInput", () => {
		keyboard.injectText("")
		expect(mockSendInput).not.toHaveBeenCalled()
	})

	it("retries unsent event suffix on partial sendInput return", () => {
		// Mock sendInput to send 1 event on first call, then remaining 1 event on second call
		mockSendInput
			.mockImplementationOnce(() => 1)
			.mockImplementationOnce((events: WindowsInput[]) => events.length)

		keyboard.injectKey("w", "") // produces 2 events (down + up)

		expect(mockSendInput).toHaveBeenCalledTimes(2)
		const [firstBatch] = mockSendInput.mock.calls[0]
		const [secondBatch] = mockSendInput.mock.calls[1]

		expect(firstBatch.length).toBe(2)
		expect(secondBatch.length).toBe(1)
		expect(getKeyboardInput(secondBatch[0]).dwFlags).toBe(
			KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
		)
	})

	it("stops retrying if sendInput returns zero or negative", () => {
		mockSendInput.mockImplementationOnce(() => 0)

		keyboard.injectKey("w", "")

		expect(mockSendInput).toHaveBeenCalledTimes(1)
	})

	it("aborts injectText and does not submit subsequent batches if an earlier batch fails", () => {
		mockSendInput.mockImplementationOnce(() => 0)

		const longText = "a".repeat(501)
		keyboard.injectText(longText)

		expect(mockSendInput).toHaveBeenCalledTimes(1)
	})
})
