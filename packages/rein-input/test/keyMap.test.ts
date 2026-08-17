import { describe, it, expect } from "vitest"
import { resolveChar } from "../src/utils"
import {
	VK_MAP,
	LINUX_KEY_MAP,
	MAC_KEY_MAP,
	SHIFTED_CHARS,
} from "../src/keyMap"

describe("keyMap & resolveChar utilities", () => {
	describe("resolveChar", () => {
		it("resolves lowercase letters directly without shift", () => {
			const res = resolveChar("a", LINUX_KEY_MAP)
			expect(res).toEqual({ code: LINUX_KEY_MAP.a, shifted: false })
		})

		it("resolves uppercase letters with shifted: true", () => {
			const res = resolveChar("A", LINUX_KEY_MAP)
			expect(res).toEqual({ code: LINUX_KEY_MAP.a, shifted: true })
		})

		it("resolves special shifted characters like '!' to base character code with shift", () => {
			const res = resolveChar("!", LINUX_KEY_MAP)
			expect(res).toEqual({ code: LINUX_KEY_MAP["1"], shifted: true })
		})

		it("resolves shifted symbol '$' to '4' code with shift", () => {
			const res = resolveChar("$", MAC_KEY_MAP)
			expect(res).toEqual({ code: MAC_KEY_MAP["4"], shifted: true })
		})

		it("resolves direct punctuation without shift", () => {
			const res = resolveChar("-", LINUX_KEY_MAP)
			expect(res).toEqual({ code: LINUX_KEY_MAP["-"], shifted: false })
		})

		it("returns undefined code and shifted false for unknown characters", () => {
			const res = resolveChar("🚀", LINUX_KEY_MAP)
			expect(res).toEqual({ code: undefined, shifted: false })
		})
	})

	describe("Keymap Integrity", () => {
		it("VK_MAP contains essential modifier and function keys", () => {
			expect(VK_MAP.shift).toBe(0x10)
			expect(VK_MAP.control).toBe(0x11)
			expect(VK_MAP.alt).toBe(0x12)
			expect(VK_MAP.space).toBe(0x20)
			expect(VK_MAP.enter).toBe(0x0d)
			expect(VK_MAP.escape).toBe(0x1b)
			expect(VK_MAP.f1).toBe(0x70)
			expect(VK_MAP.audioplay).toBe(0xb3)
		})

		it("LINUX_KEY_MAP contains essential uinput key codes", () => {
			expect(LINUX_KEY_MAP.shift).toBe(0x2a)
			expect(LINUX_KEY_MAP.control).toBe(0x1d)
			expect(LINUX_KEY_MAP.alt).toBe(0x38)
			expect(LINUX_KEY_MAP.meta).toBe(0x7d)
			expect(LINUX_KEY_MAP.space).toBe(0x39)
			expect(LINUX_KEY_MAP.enter).toBe(0x1c)
			expect(LINUX_KEY_MAP.audiomute).toBe(0x71)
		})

		it("MAC_KEY_MAP contains essential virtual key codes", () => {
			expect(MAC_KEY_MAP.shift).toBe(0x38)
			expect(MAC_KEY_MAP.control).toBe(0x3b)
			expect(MAC_KEY_MAP.command).toBe(0x37)
			expect(MAC_KEY_MAP.option).toBe(0x3a)
			expect(MAC_KEY_MAP.space).toBe(0x31)
			expect(MAC_KEY_MAP.return).toBe(0x24)
			expect(MAC_KEY_MAP.audiomute).toBe(0x4a)
		})

		it("SHIFTED_CHARS covers common US keyboard shifted symbols", () => {
			expect(SHIFTED_CHARS["!"]).toBe("1")
			expect(SHIFTED_CHARS["@"]).toBe("2")
			expect(SHIFTED_CHARS["#"]).toBe("3")
			expect(SHIFTED_CHARS.$).toBe("4")
			expect(SHIFTED_CHARS["%"]).toBe("5")
			expect(SHIFTED_CHARS["^"]).toBe("6")
			expect(SHIFTED_CHARS["&"]).toBe("7")
			expect(SHIFTED_CHARS["*"]).toBe("8")
			expect(SHIFTED_CHARS["("]).toBe("9")
			expect(SHIFTED_CHARS[")"]).toBe("0")
			expect(SHIFTED_CHARS._).toBe("-")
			expect(SHIFTED_CHARS["+"]).toBe("=")
			expect(SHIFTED_CHARS["{"]).toBe("[")
			expect(SHIFTED_CHARS["}"]).toBe("]")
			expect(SHIFTED_CHARS["|"]).toBe("\\")
			expect(SHIFTED_CHARS[":"]).toBe(";")
			expect(SHIFTED_CHARS['"']).toBe("'")
			expect(SHIFTED_CHARS["<"]).toBe(",")
			expect(SHIFTED_CHARS[">"]).toBe(".")
			expect(SHIFTED_CHARS["?"]).toBe("/")
			expect(SHIFTED_CHARS["~"]).toBe("`")
		})
	})
})
