import { execSync } from "node:child_process"
import os from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	createCaptureProvider,
	LinuxWaylandPortalCaptureProvider,
	LinuxX11CaptureProvider,
	MacOSCaptureProvider,
	WindowsCaptureProvider,
	setupLinuxHeadlessDisplay,
	teardownLinuxHeadlessDisplay,
} from "@/server/gstreamer/captureProvider.ts"

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}))

const mockInitializeDbus = vi.fn().mockResolvedValue(undefined)
const mockDisposeDbus = vi.fn().mockResolvedValue(undefined)

vi.mock("@/server/gstreamer/utils.ts", () => {
	class MockImplementDbus {
		public pipewireNodeId = 42
		public onFailure?: (err: Error) => void
		public initializeDbus = mockInitializeDbus
		public dispose = mockDisposeDbus
		constructor(public displayMode: "duplicate" | "extended" = "duplicate") {}
	}
	return {
		ImplementDbus: MockImplementDbus,
	}
})

vi.mock("@/utils/logger.ts", () => ({
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

describe("Linux headless virtual display management", () => {
	const originalPlatform = os.platform
	const originalHyprland = process.env.HYPRLAND_INSTANCE_SIGNATURE
	const originalSwaysock = process.env.SWAYSOCK

	beforeEach(() => {
		vi.clearAllMocks()
		delete process.env.HYPRLAND_INSTANCE_SIGNATURE
		delete process.env.SWAYSOCK
	})

	afterEach(() => {
		os.platform = originalPlatform
		if (originalHyprland === undefined) {
			delete process.env.HYPRLAND_INSTANCE_SIGNATURE
		} else {
			process.env.HYPRLAND_INSTANCE_SIGNATURE = originalHyprland
		}
		if (originalSwaysock === undefined) {
			delete process.env.SWAYSOCK
		} else {
			process.env.SWAYSOCK = originalSwaysock
		}
	})

	describe("setupLinuxHeadlessDisplay", () => {
		it("returns null on non-Linux platforms", () => {
			os.platform = () => "win32"
			expect(setupLinuxHeadlessDisplay()).toBeNull()
			expect(execSync).not.toHaveBeenCalled()
		})

		it("creates headless output on Hyprland compositor", () => {
			os.platform = () => "linux"
			process.env.HYPRLAND_INSTANCE_SIGNATURE = "instance_123"
			vi.mocked(execSync).mockReturnValueOnce("ok: HEADLESS-2 created\n")

			const handle = setupLinuxHeadlessDisplay()
			expect(execSync).toHaveBeenCalledWith(
				"hyprctl output create headless",
				expect.objectContaining({ encoding: "utf-8", timeout: 2000 }),
			)
			expect(handle).toEqual({
				type: "hyprland",
				outputName: "HEADLESS-2",
			})
		})

		it("falls back to HEADLESS-1 if Hyprland output name cannot be parsed", () => {
			os.platform = () => "linux"
			process.env.HYPRLAND_INSTANCE_SIGNATURE = "instance_123"
			vi.mocked(execSync).mockReturnValueOnce("ok\n")

			const handle = setupLinuxHeadlessDisplay()
			expect(handle).toEqual({
				type: "hyprland",
				outputName: "HEADLESS-1",
			})
		})

		it("returns null if Hyprland command throws", () => {
			os.platform = () => "linux"
			process.env.HYPRLAND_INSTANCE_SIGNATURE = "instance_123"
			vi.mocked(execSync).mockImplementationOnce(() => {
				throw new Error("command not found")
			})

			const handle = setupLinuxHeadlessDisplay()
			expect(handle).toBeNull()
		})

		it("creates headless output on Sway compositor", () => {
			os.platform = () => "linux"
			process.env.SWAYSOCK = "/run/user/1000/sway.sock"
			vi.mocked(execSync).mockReturnValueOnce("HEADLESS-1\n")

			const handle = setupLinuxHeadlessDisplay()
			expect(execSync).toHaveBeenCalledWith(
				"swaymsg create_output",
				expect.objectContaining({ encoding: "utf-8", timeout: 2000 }),
			)
			expect(handle).toEqual({
				type: "sway",
				outputName: "HEADLESS-1",
			})
		})

		it("returns null if Sway command throws", () => {
			os.platform = () => "linux"
			process.env.SWAYSOCK = "/run/user/1000/sway.sock"
			vi.mocked(execSync).mockImplementationOnce(() => {
				throw new Error("command failed")
			})

			const handle = setupLinuxHeadlessDisplay()
			expect(handle).toBeNull()
		})

		it("returns null when no known compositor is active", () => {
			os.platform = () => "linux"
			expect(setupLinuxHeadlessDisplay()).toBeNull()
			expect(execSync).not.toHaveBeenCalled()
		})
	})

	describe("teardownLinuxHeadlessDisplay", () => {
		it("does nothing when handle is null", () => {
			teardownLinuxHeadlessDisplay(null)
			expect(execSync).not.toHaveBeenCalled()
		})

		it("removes Hyprland headless output", () => {
			teardownLinuxHeadlessDisplay({
				type: "hyprland",
				outputName: "HEADLESS-2",
			})
			expect(execSync).toHaveBeenCalledWith(
				"hyprctl output remove HEADLESS-2",
				expect.objectContaining({ timeout: 2000 }),
			)
		})

		it("unplugs Sway headless output", () => {
			teardownLinuxHeadlessDisplay({
				type: "sway",
				outputName: "HEADLESS-1",
			})
			expect(execSync).toHaveBeenCalledWith(
				'swaymsg "output HEADLESS-1 unplug"',
				expect.objectContaining({ timeout: 2000 }),
			)
		})

		it("does not throw if removal fails", () => {
			vi.mocked(execSync).mockImplementationOnce(() => {
				throw new Error("Failed to remove")
			})
			expect(() =>
				teardownLinuxHeadlessDisplay({
					type: "hyprland",
					outputName: "HEADLESS-1",
				}),
			).not.toThrow()
		})
	})
})

describe("LinuxWaylandPortalCaptureProvider headless integration", () => {
	const originalPlatform = os.platform
	const originalHyprland = process.env.HYPRLAND_INSTANCE_SIGNATURE

	beforeEach(() => {
		vi.clearAllMocks()
		mockInitializeDbus.mockResolvedValue(undefined)
		mockDisposeDbus.mockResolvedValue(undefined)
		os.platform = () => "linux"
		process.env.HYPRLAND_INSTANCE_SIGNATURE = "instance_123"
	})

	afterEach(() => {
		os.platform = originalPlatform
		if (originalHyprland === undefined) {
			delete process.env.HYPRLAND_INSTANCE_SIGNATURE
		} else {
			process.env.HYPRLAND_INSTANCE_SIGNATURE = originalHyprland
		}
	})

	it("auto-creates and tears down headless display in extended mode", async () => {
		vi.mocked(execSync).mockReturnValueOnce("ok: HEADLESS-1 created\n")

		const provider = new LinuxWaylandPortalCaptureProvider("extended")
		await provider.initialize()

		expect(execSync).toHaveBeenCalledWith(
			"hyprctl output create headless",
			expect.anything(),
		)
		expect(mockInitializeDbus).toHaveBeenCalled()

		await provider.dispose()
		expect(execSync).toHaveBeenCalledWith(
			"hyprctl output remove HEADLESS-1",
			expect.anything(),
		)
		expect(mockDisposeDbus).toHaveBeenCalled()
	})

	it("tears down headless display if portal initialization fails", async () => {
		vi.mocked(execSync).mockReturnValueOnce("ok: HEADLESS-1 created\n")
		mockInitializeDbus.mockRejectedValueOnce(new Error("portal error"))

		const provider = new LinuxWaylandPortalCaptureProvider("extended")
		await expect(provider.initialize()).rejects.toThrow("portal error")

		expect(execSync).toHaveBeenCalledWith(
			"hyprctl output remove HEADLESS-1",
			expect.anything(),
		)
	})

	it("does not create headless display in duplicate mode", async () => {
		const provider = new LinuxWaylandPortalCaptureProvider("duplicate")
		await provider.initialize()

		expect(execSync).not.toHaveBeenCalled()
		expect(mockInitializeDbus).toHaveBeenCalled()

		await provider.dispose()
		expect(mockDisposeDbus).toHaveBeenCalled()
	})
})
