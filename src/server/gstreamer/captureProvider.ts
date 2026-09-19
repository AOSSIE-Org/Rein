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
	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		logger.info("Initialized DXGI capture")
	}

	public async getGStreamerSource(): Promise<string[]> {
		return [
			"d3d11screencapturesrc",
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
	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		logger.info("Initialized X11 capture")
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
	public async initialize(_onFailure?: (err: Error) => void): Promise<void> {
		logger.info("Initialized AVFoundation capture")
	}

	public async getGStreamerSource(): Promise<string[]> {
		return ["avfvideosrc", "capture-screen=true", "capture-screen-cursor=true"]
	}

	public async dispose(): Promise<void> {}
}

export class LinuxWaylandPortalCaptureProvider implements CaptureProvider {
	private readonly dbus = new ImplementDbus()
	private initialized = false
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
			logger.error(
				`Wayland portal initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			)
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
export function createCaptureProvider(): CaptureProvider {
	const platform = os.platform()

	if (platform === "win32") {
		return new WindowsCaptureProvider()
	}

	if (platform === "darwin") {
		return new MacOSCaptureProvider()
	}

	if (platform === "linux") {
		const isWayland =
			process.env.XDG_SESSION_TYPE === "wayland" ||
			!!process.env.WAYLAND_DISPLAY
		if (isWayland) {
			return new LinuxWaylandPortalCaptureProvider()
		}
		return new LinuxX11CaptureProvider()
	}

	throw new Error(`Unsupported OS platform: ${platform}`)
}
