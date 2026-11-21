/**
 * Cross-platform screen capture source provider factory and implementations.
 *
 * Selects the appropriate capture provider (DXGI for Windows, X11 or Wayland
 * Portal for Linux, AVFoundation for macOS) and supplies the GStreamer source pipeline blocks.
 */

import { execSync } from "node:child_process"
import os from "node:os"
import logger from "../../utils/logger.ts"
import { ImplementDbus } from "./utils.ts"

export interface CaptureProvider {
	initialize(onFailure?: (err: Error) => void): Promise<void>
	getGStreamerSource(): Promise<string[]>
	dispose(): Promise<void>
}

export interface HeadlessDisplayHandle {
	type: "hyprland" | "sway"
	outputName: string
}

export function setupLinuxHeadlessDisplay(): HeadlessDisplayHandle | null {
	if (os.platform() !== "linux") return null

	// Hyprland compositor
	if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
		try {
			const res = execSync("hyprctl output create headless", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 2000,
			}).trim()
			const match = res.match(/HEADLESS-\d+/i)
			const outputName = match ? match[0] : "HEADLESS-1"
			logger.info(`Auto-created Hyprland headless output: ${outputName}`)
			return { type: "hyprland", outputName }
		} catch (err) {
			logger.warn(`Failed to auto-create Hyprland headless output: ${err}`)
		}
	}

	// Sway / wlroots compositor
	if (process.env.SWAYSOCK) {
		try {
			const res = execSync("swaymsg create_output", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 2000,
			}).trim()
			const match = res.match(/HEADLESS-\d+/i)
			const outputName = match ? match[0] : "HEADLESS-1"
			logger.info(`Auto-created Sway headless output: ${outputName}`)
			return { type: "sway", outputName }
		} catch (err) {
			logger.warn(`Failed to auto-create Sway headless output: ${err}`)
		}
	}

	return null
}

export function teardownLinuxHeadlessDisplay(
	handle: HeadlessDisplayHandle | null,
): void {
	if (!handle) return
	try {
		if (handle.type === "hyprland") {
			execSync(`hyprctl output remove ${handle.outputName}`, {
				stdio: "ignore",
				timeout: 2000,
			})
			logger.info(`Removed Hyprland headless output: ${handle.outputName}`)
		} else if (handle.type === "sway") {
			execSync(`swaymsg "output ${handle.outputName} unplug"`, {
				stdio: "ignore",
				timeout: 2000,
			})
			logger.info(`Removed Sway headless output: ${handle.outputName}`)
		}
	} catch (err) {
		logger.warn(
			`Failed to teardown headless display (${handle.outputName}): ${err}`,
		)
	}
}

export class WindowsCaptureProvider implements CaptureProvider {
	constructor(private monitorIndex = 0) {}

	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		logger.info(`Initialized DXGI capture on monitor ${this.monitorIndex}`)
	}

	public async getGStreamerSource(): Promise<string[]> {
		return [
			"d3d11screencapturesrc",
			`monitor-index=${this.monitorIndex}`,
			"do-timestamp=true",
			"show-cursor=true",
			"!",
			"queue",
			"max-size-buffers=5",
			"leaky=downstream",
			"!",
			"d3d11convert",
			"!",
			"d3d11download",
		]
	}

	public async dispose(): Promise<void> {}
}

export class LinuxX11CaptureProvider implements CaptureProvider {
	constructor(private monitorIndex = 0) {}

	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		if (this.monitorIndex > 0) {
			logger.warn(
				`X11 multi-monitor capture on index ${this.monitorIndex} is not ` +
					"supported; using root display capture.",
			)
		} else {
			logger.info("Initialized X11 capture")
		}
	}

	public async getGStreamerSource(): Promise<string[]> {
		const activeDisplay = process.env.DISPLAY || ":0"
		return [
			"ximagesrc",
			`display-name=${activeDisplay}`,
			"use-damage=false",
			"show-pointer=true",
		]
	}

	public async dispose(): Promise<void> {}
}

export class MacOSCaptureProvider implements CaptureProvider {
	constructor(private monitorIndex = 0) {}

	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		logger.info(
			`Initialized AVFoundation capture on monitor ${this.monitorIndex}`,
		)
	}

	public async getGStreamerSource(): Promise<string[]> {
		return [
			"avfvideosrc",
			"capture-screen=true",
			`device-index=${this.monitorIndex}`,
			"capture-screen-cursor=true",
		]
	}

	public async dispose(): Promise<void> {}
}

export class LinuxWaylandPortalCaptureProvider implements CaptureProvider {
	private readonly dbus: ImplementDbus
	private initialized = false
	private headlessHandle: HeadlessDisplayHandle | null = null

	constructor(private displayMode: "duplicate" | "extended" = "duplicate") {
		this.dbus = new ImplementDbus(displayMode)
	}

	public async initialize(onFailure?: (err: Error) => void): Promise<void> {
		logger.info("Initializing Wayland Portal capture")
		if (this.displayMode === "extended") {
			this.headlessHandle = setupLinuxHeadlessDisplay()
		}
		if (onFailure) {
			this.dbus.onFailure = (err) => {
				if (this.initialized) {
					onFailure(err)
				}
			}
		}
		try {
			await this.dbus.initializeDbus()
			this.initialized = true
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			logger.error(`Wayland portal initialization failed: ${msg}`)
			teardownLinuxHeadlessDisplay(this.headlessHandle)
			this.headlessHandle = null
			throw error
		}
	}

	public async getGStreamerSource(): Promise<string[]> {
		if (this.dbus.pipewireNodeId !== null && this.dbus.pipewireNodeId > 0) {
			return [
				"pipewiresrc",
				`path=${this.dbus.pipewireNodeId}`,
				"do-timestamp=true",
			]
		}
		throw new Error("PipeWire node ID not found")
	}

	public async dispose(): Promise<void> {
		await this.dbus.dispose()
		teardownLinuxHeadlessDisplay(this.headlessHandle)
		this.headlessHandle = null
		logger.info("Wayland portal disposed")
	}
}

export function createCaptureProvider(
	monitorIndex = 0,
	displayMode: "duplicate" | "extended" = "duplicate",
): CaptureProvider {
	const platform = os.platform()

	if (platform === "win32") {
		return new WindowsCaptureProvider(monitorIndex)
	}

	if (platform === "darwin") {
		return new MacOSCaptureProvider(monitorIndex)
	}

	if (platform === "linux") {
		const isWayland =
			process.env.XDG_SESSION_TYPE === "wayland" ||
			!!process.env.WAYLAND_DISPLAY
		if (isWayland) {
			return new LinuxWaylandPortalCaptureProvider(displayMode)
		}
		return new LinuxX11CaptureProvider(monitorIndex)
	}

	throw new Error(`Unsupported OS platform: ${platform}`)
}
