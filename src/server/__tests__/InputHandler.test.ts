import { describe, it, expect, vi, beforeEach } from "vitest"
import { InputHandler } from "../InputHandler"
import { mouse, keyboard, Key, Button, Point } from "@nut-tree-fork/nut-js"
import { moveRelative } from "../ydotool"

vi.mock("@nut-tree-fork/nut-js", () => ({
	mouse: {
		config: { mouseSpeed: 0 },
		getPosition: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
		setPosition: vi.fn().mockResolvedValue(undefined),
		pressButton: vi.fn().mockResolvedValue(undefined),
		releaseButton: vi.fn().mockResolvedValue(undefined),
		scrollDown: vi.fn().mockResolvedValue(undefined),
		scrollUp: vi.fn().mockResolvedValue(undefined),
		scrollRight: vi.fn().mockResolvedValue(undefined),
		scrollLeft: vi.fn().mockResolvedValue(undefined),
	},
	keyboard: {
		pressKey: vi.fn().mockResolvedValue(undefined),
		releaseKey: vi.fn().mockResolvedValue(undefined),
		type: vi.fn().mockResolvedValue(undefined),
	},
	Key: {
		LeftControl: 1,
		LeftSuper: 2,
		C: 3,
		V: 4,
		Space: 5,
		Enter: 6,
	},
	Button: {
		LEFT: 0,
		RIGHT: 1,
		MIDDLE: 2,
	},
	Point: vi.fn().mockImplementation((x, y) => ({ x, y })),
}))

vi.mock("../ydotool", () => ({
	moveRelative: vi.fn().mockResolvedValue(true),
}))

describe("InputHandler", () => {
	let handler: InputHandler

	beforeEach(() => {
		vi.clearAllMocks()
		handler = new InputHandler(0) // 0 throttle for testing
	})

	it("should handle move events via ydotool", async () => {
		await handler.handleMessage({ type: "move", dx: 10, dy: 20 })
		expect(moveRelative).toHaveBeenCalledWith(10, 20)
	})

	it("should fallback to mouse.setPosition if ydotool fails", async () => {
		vi.mocked(moveRelative).mockResolvedValueOnce(false)
		await handler.handleMessage({ type: "move", dx: 10, dy: 20 })

		expect(mouse.getPosition).toHaveBeenCalled()
		expect(mouse.setPosition).toHaveBeenCalledWith({ x: 110, y: 120 })
	})

	it("should clamp move coordinates", async () => {
		await handler.handleMessage({ type: "move", dx: 3000, dy: -3000 })
		expect(moveRelative).toHaveBeenCalledWith(2000, -2000)
	})

	it("should handle click events", async () => {
		await handler.handleMessage({ type: "click", button: "left", press: true })
		expect(mouse.pressButton).toHaveBeenCalledWith(Button.LEFT)

		await handler.handleMessage({ type: "click", button: "right", press: false })
		expect(mouse.releaseButton).toHaveBeenCalledWith(Button.RIGHT)
	})

	it("should handle scroll events", async () => {
		await handler.handleMessage({ type: "scroll", dy: 5, dx: -5 })
		expect(mouse.scrollDown).toHaveBeenCalledWith(5)
		expect(mouse.scrollLeft).toHaveBeenCalledWith(5)
	})

	it("should handle key events", async () => {
		await handler.handleMessage({ type: "key", key: "a" })
		expect(keyboard.type).toHaveBeenCalledWith("a")
	})

	it("should handle special keys via KEY_MAP", async () => {
		// Mocking KEY_MAP is tricky because it's imported in InputHandler.
		// For now, we test the 'type' fallback or common keys.
		await handler.handleMessage({ type: "key", key: "Enter" })
		// Enter should be in KEY_MAP, but we'll see if it calls press/release
		expect(keyboard.pressKey).toHaveBeenCalled()
		expect(keyboard.releaseKey).toHaveBeenCalled()
	})

	it("should handle combo events", async () => {
		await handler.handleMessage({ type: "combo", keys: ["Control", "c"] })
		expect(keyboard.pressKey).toHaveBeenCalled()
		expect(keyboard.type).toHaveBeenCalledWith("c")
		expect(keyboard.releaseKey).toHaveBeenCalled()
	})

	it("should handle text events", async () => {
		await handler.handleMessage({ type: "text", text: "Hello World" })
		expect(keyboard.type).toHaveBeenCalledWith("Hello World")
	})

	it("should handle zoom events", async () => {
		await handler.handleMessage({ type: "zoom", delta: 10 })
		expect(keyboard.pressKey).toHaveBeenCalledWith(Key.LeftControl)
		expect(mouse.scrollUp).toHaveBeenCalled()
		expect(keyboard.releaseKey).toHaveBeenCalledWith(Key.LeftControl)
	})

	it("should handle copy and paste events", async () => {
		await handler.handleMessage({ type: "copy" })
		expect(keyboard.pressKey).toHaveBeenCalledWith(expect.anything(), Key.C)

		await handler.handleMessage({ type: "paste" })
		expect(keyboard.pressKey).toHaveBeenCalledWith(expect.anything(), Key.V)
	})
})
