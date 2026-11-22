import { describe, expect, it } from "vitest"
import { t } from "@/utils/i18n"

describe("t (translation helper)", () => {
	it("looks up a known key", () => {
		expect(t("nav", "trackpad")).toBe("Trackpad")
		expect(t("nav", "settings")).toBe("Settings")
		expect(t("errorComponent", "reconnect")).toBe("Reconnect")
		expect(t("touchArea", "scrollMode")).toBe("Scroll Mode")
		expect(t("trackpad", "scrollActive")).toBe("SCROLL Active")
		expect(t("controlBar", "hold")).toBe("Hold")
		expect(t("extraKeys", "mute")).toBe("Mute")
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
