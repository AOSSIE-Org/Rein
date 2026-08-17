import { describe, it, expect } from "vitest"
import { LinuxInputInjector } from "../src/linux"
import { MacInputInjector } from "../src/mac"
import { WindowsInputInjector } from "../src/windows"

describe("Platform Injectors Platform Guard", () => {
	it("LinuxInputInjector throws on non-linux systems", () => {
		if (process.platform !== "linux") {
			expect(() => new LinuxInputInjector()).toThrow(
				"LinuxInputInjector can only be used on Linux",
			)
		}
	})

	it("MacInputInjector throws on non-darwin systems", () => {
		if (process.platform !== "darwin") {
			expect(() => new MacInputInjector()).toThrow(
				"MacInputInjector can only be used on macOS",
			)
		}
	})

	it("WindowsInputInjector throws on non-win32 systems", () => {
		if (process.platform !== "win32") {
			expect(() => new WindowsInputInjector()).toThrow(
				"WindowsInputInjector can only be used on Windows",
			)
		}
	})
})
