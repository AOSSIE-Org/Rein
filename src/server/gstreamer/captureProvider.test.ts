import os from "node:os"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	createCaptureProvider,
	LinuxWaylandPortalCaptureProvider,
	LinuxX11CaptureProvider,
	MacOSCaptureProvider,
	WindowsCaptureProvider,
} from "./captureProvider.ts"

vi.mock("../../utils/logger.ts", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}))

describe("CaptureProvider - Monitor selection", () => {
	it("WindowsCaptureProvider uses monitor-index 0 by default", async () => {
		const provider = new WindowsCaptureProvider()
		const source = await provider.getGStreamerSource()
		expect(source).toContain("d3d11screencapturesrc")
		expect(source).toContain("monitor-index=0")
	})

	it("WindowsCaptureProvider uses custom monitor-index", async () => {
		const provider = new WindowsCaptureProvider(1)
		const source = await provider.getGStreamerSource()
		expect(source).toContain("d3d11screencapturesrc")
		expect(source).toContain("monitor-index=1")
	})

	it("MacOSCaptureProvider uses device-index 0 by default", async () => {
		const provider = new MacOSCaptureProvider()
		const source = await provider.getGStreamerSource()
		expect(source).toContain("avfvideosrc")
		expect(source).toContain("device-index=0")
	})

	it("MacOSCaptureProvider uses custom device-index", async () => {
		const provider = new MacOSCaptureProvider(2)
		const source = await provider.getGStreamerSource()
		expect(source).toContain("avfvideosrc")
		expect(source).toContain("device-index=2")
	})

	describe("createCaptureProvider factory", () => {
		const originalPlatform = os.platform
		const originalSession = process.env.XDG_SESSION_TYPE
		const originalWayland = process.env.WAYLAND_DISPLAY

		afterEach(() => {
			os.platform = originalPlatform
			if (originalSession === undefined) {
				delete process.env.XDG_SESSION_TYPE
			} else {
				process.env.XDG_SESSION_TYPE = originalSession
			}
			if (originalWayland === undefined) {
				delete process.env.WAYLAND_DISPLAY
			} else {
				process.env.WAYLAND_DISPLAY = originalWayland
			}
		})

		it("instantiates WindowsCaptureProvider with monitorIndex", async () => {
			os.platform = () => "win32"
			const provider = createCaptureProvider(1)
			expect(provider).toBeInstanceOf(WindowsCaptureProvider)
			const source = await provider.getGStreamerSource()
			expect(source).toContain("monitor-index=1")
		})

		it("instantiates MacOSCaptureProvider with monitorIndex", async () => {
			os.platform = () => "darwin"
			const provider = createCaptureProvider(1)
			expect(provider).toBeInstanceOf(MacOSCaptureProvider)
			const source = await provider.getGStreamerSource()
			expect(source).toContain("device-index=1")
		})

		it("instantiates LinuxWaylandPortalCaptureProvider", () => {
			os.platform = () => "linux"
			process.env.XDG_SESSION_TYPE = "wayland"
			const provider = createCaptureProvider(0, "extended")
			expect(provider).toBeInstanceOf(LinuxWaylandPortalCaptureProvider)
		})

		it("instantiates LinuxX11CaptureProvider with monitorIndex", () => {
			os.platform = () => "linux"
			delete process.env.XDG_SESSION_TYPE
			delete process.env.WAYLAND_DISPLAY
			const provider = createCaptureProvider(1)
			expect(provider).toBeInstanceOf(LinuxX11CaptureProvider)
		})
	})
})
