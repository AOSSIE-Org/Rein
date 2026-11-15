import { describe, expect, it } from "vitest"
import { t } from "@/utils/i18n"

describe("t (translation helper)", () => {
	it("looks up a known key", () => {
		expect(t("nav", "trackpad")).toBe("Trackpad")
		expect(t("nav", "settings")).toBe("Settings")
	})

	it("interpolates a single param", () => {
		expect(t("themePicker", "selectTheme", { theme: "Dracula" })).toBe(
			"Select Dracula theme",
		)
	})

	it("coerces numeric params to strings", () => {
		expect(t("serverTab", "firewallAlert", { port: 3000 })).toContain("3000")
	})

	it("leaves placeholders intact when no params are passed", () => {
		expect(t("themePicker", "selectTheme")).toBe("Select {theme} theme")
	})
})
