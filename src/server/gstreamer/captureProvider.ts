/**
 * Cross-platform screen capture source provider factory and implementations.
 *
 * Selects the appropriate capture provider (DXGI for Windows, X11 or Wayland
 * Portal for Linux, AVFoundation for macOS) and supplies the GStreamer source pipeline blocks.
 */

import os from "node:os"
import logger from "../../utils/logger.ts"
import { ImplementDbus } from "./utils.ts"
export interface CaptureProvider {
	initialize(onFailure?: (err: Error) => void): Promise<void>
	getGStreamerSource(): Promise<string[]>
	dispose(): Promise<void>
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

	constructor(displayMode: "duplicate" | "extended" = "duplicate") {
		this.dbus = new ImplementDbus(displayMode)
	}

	public async initialize(onFailure?: (err: Error) => void): Promise<void> {
		logger.info("Initializing Wayland Portal capture")
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
