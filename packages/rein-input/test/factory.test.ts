import { describe, it, expect, vi } from "vitest"
import { createInputInjector, StubInputInjector } from "../src/factory"
import { DEFAULT_CONFIG } from "../src/constants"

describe("createInputInjector & StubInputInjector", () => {
	describe("StubInputInjector", () => {
		it("safely handles all injector methods without throwing", () => {
			const warnings: string[] = []
			const stub = new StubInputInjector(DEFAULT_CONFIG, (method) => {
				warnings.push(method)
			})

			expect(() => stub.injectMouseMove(10, 10)).not.toThrow()
			expect(() => stub.injectMouseButton("left", true)).not.toThrow()
			expect(() => stub.injectMouseButton("left", false)).not.toThrow()
			expect(() => stub.injectMouseWheel(0, 5)).not.toThrow()
			expect(() => stub.injectKey("enter")).not.toThrow()
			expect(() => stub.injectCombo(["control", "c"])).not.toThrow()
			expect(() => stub.injectText("hello")).not.toThrow()
			expect(() =>
				stub.injectTouch([{ id: 1, x: 100, y: 100, state: "down" }]),
			).not.toThrow()
			expect(() => stub.updateConfig({ sensitivity: 2.0 })).not.toThrow()
			expect(() => stub.destroy()).not.toThrow()

			expect(warnings).toContain("injectMouseMove")
			expect(warnings).toContain("injectMouseButton")
			expect(warnings).toContain("injectMouseWheel")
			expect(warnings).toContain("injectKey")
			expect(warnings).toContain("injectCombo")
			expect(warnings).toContain("injectText")
			expect(warnings).toContain("injectTouch")
		})
	})

	describe("createInputInjector factory", () => {
		it("returns a StubInputInjector for unsupported platforms without throwing", () => {
			const onError = vi.fn()
			const injector = createInputInjector({
				platform: "aix" as NodeJS.Platform,
				onError,
			})

			expect(injector).toBeInstanceOf(StubInputInjector)
			expect(onError).toHaveBeenCalledWith(
				"unsupported-platform",
				expect.stringContaining("Unsupported platform: aix"),
			)
		})

		it("instantiates StubInputInjector when unknown platform string is provided", () => {
			const injector = createInputInjector({
				platform: "freebsd" as NodeJS.Platform,
			})
			expect(injector).toBeInstanceOf(StubInputInjector)
		})

		it("handles direct Partial<InputConfig> argument gracefully", () => {
			const injector = createInputInjector({
				sensitivity: 1.5,
				screenWidth: 2560,
			})
			expect(injector).toBeDefined()
		})
	})
})
