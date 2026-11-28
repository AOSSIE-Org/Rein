import { describe, expect, it } from "vitest"
import {
	EXTENDED_KEY_VKS,
	LINUX_KEY_MAP,
	MAC_KEY_MAP,
	SHIFTED_CHARS,
	VK_MAP,
	VK_TO_SCANCODE,
} from "@/server/drivers/keyMap.ts"
import { resolveChar } from "@/server/drivers/utils.ts"

describe("cross-platform key maps", () => {
	it("maps common names and aliases to Windows virtual-key codes", () => {
		expect(VK_MAP).toMatchObject({
			backspace: 0x08,
			enter: 0x0d,
			ctrl: 0x11,
			control: 0x11,
			arrowleft: 0x25,
			leftctrl: 0xa2,
			rightctrl: 0xa3,
			"0": 0x30,
			z: 0x5a,
			f12: 0x7b,
		})
	})

	it("maps representative Linux and macOS keys to their native codes", () => {
		expect(LINUX_KEY_MAP).toMatchObject({
			ctrl: 0x1d,
			rightalt: 0x64,
			arrowup: 0x67,
			a: 0x1e,
			audiomute: 0x71,
		})
		expect(MAC_KEY_MAP).toMatchObject({
			command: 0x37,
			option: 0x3a,
			arrowright: 0x7c,
			return: 0x24,
			a: 0x00,
			numpadenter: 0x4c,
		})
	})

	it("maps Windows virtual keys to scan codes and marks extended keys", () => {
		expect(VK_TO_SCANCODE).toMatchObject({
			8: 0x0e,
			13: 0x1c,
			32: 0x39,
			65: 0x1e,
			112: 0x3b,
			186: 0x27,
		})
		expect(EXTENDED_KEY_VKS.has(VK_MAP.arrowleft)).toBe(true)
		expect(EXTENDED_KEY_VKS.has(VK_MAP.delete)).toBe(true)
		expect(EXTENDED_KEY_VKS.has(VK_MAP.rightcontrol)).toBe(true)
		expect(EXTENDED_KEY_VKS.has(VK_MAP.a)).toBe(false)
	})

	it("resolves shifted symbols to their unshifted base characters", () => {
		expect(SHIFTED_CHARS).toMatchObject({
			"!": "1",
			"@": "2",
			_: "-",
			"+": "=",
			"?": "/",
			"~": "`",
		})
		expect(resolveChar("A", LINUX_KEY_MAP)).toEqual({
			code: LINUX_KEY_MAP.a,
			shifted: true,
		})
		expect(resolveChar("!", LINUX_KEY_MAP)).toEqual({
			code: LINUX_KEY_MAP["1"],
			shifted: true,
		})
		expect(resolveChar("a", LINUX_KEY_MAP)).toEqual({
			code: LINUX_KEY_MAP.a,
			shifted: false,
		})
		expect(resolveChar("é", LINUX_KEY_MAP)).toEqual({
			code: undefined,
			shifted: false,
		})
	})
})
