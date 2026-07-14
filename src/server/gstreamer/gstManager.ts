/**
 * GStreamer pipeline process manager.
 *
 * Spawns and monitors the gst-launch-1.0 process for capturing and encoding
 * the screen video stream, and streaming it via WHIP signaling client.
 */

import { spawn, type ChildProcess } from "node:child_process"
import EventEmitter from "node:events"
import os from "node:os"
import fs from "node:fs"
import path from "node:path"
import logger from "../../utils/logger"
import { type CaptureProvider, createCaptureProvider } from "./captureProvider"
import { resolveGstPaths } from "./gstPaths"

export class GstManager extends EventEmitter {
	private process: ChildProcess | null = null
	private sessionId: string
	private intentionalStop = false
	private provider: CaptureProvider | null = null

	constructor(sessionId: string) {
		super()
		this.sessionId = sessionId
	}

	private buildPipelineArgs(
		sourceBlocks: string[],
		token: string,
		whipPort: number,
	): string[] {
		const platform = os.platform()
		const args = [...sourceBlocks]

		// Build the common suffix byte-for-byte identically to the old implementation
		if (platform !== "win32") {
			args.push(
				"!",
				"queue",
				"max-size-buffers=5",
				"leaky=downstream",
				"!",
				"videoconvert",
				"!",
				"videoscale",
				"!",
				"videorate",
			)
		} else {
			// Windows already appended d3d11convert/download in the source block
			args.push("!", "videoconvert", "!", "videorate")
		}

		if (platform === "darwin") {
			args.push(
				"!",
				"video/x-raw,format=NV12,framerate=30/1",
				"!",
				"vtenc_h264",
				"realtime=true",
				"max-keyframe-interval=15",
				"allow-frame-reordering=false",
				"bitrate=2500",
				"!",
				"h264parse",
				"config-interval=-1",
			)
		} else {
			args.push(
				"!",
				"video/x-raw,framerate=30/1",
				"!",
				"vp8enc",
				"deadline=1",
				"keyframe-max-dist=15",
				"target-bitrate=2500000",
			)
		}

		// Add WHIP sink
		args.push(
			"!",
			"whipclientsink",
			`signaller::whip-endpoint=http://localhost:${whipPort}/api/webrtc/whip?sessionId=${this.sessionId}&token=${token}`,
			`signaller::auth-token=Bearer_${token}`,
		)

		return args
	}

	public async start(token: string, whipPort: number): Promise<void> {
		if (this.process) return
		this.intentionalStop = false

		logger.info("Spawning GStreamer WHIP engine")

		try {
			this.provider = createCaptureProvider()
			await this.provider.initialize(async (err) => {
				logger.error(`Capture provider failed after startup: ${err.message}`)
				if (this.process) {
					this.intentionalStop = true
					this.stop()
					await this.cleanup()
				} else {
					await this.cleanup()
				}
				this.emit("capture-failure", err)
			})
			const sourceBlocks = await this.provider.getGStreamerSource()
			const pipelineArgs = this.buildPipelineArgs(sourceBlocks, token, whipPort)
			this.executePipeline(pipelineArgs, whipPort, token)
		} catch (error) {
			logger.error(`Capture initialization failed: ${String(error)}`)
			this.emit("capture-failure", error)
			await this.cleanup()
		}
	}

	private executePipeline(
		pipelineArgs: string[],
		whipPort: number,
		token: string,
	): void {
		const gst = resolveGstPaths()
		const spawnedEnv = { ...process.env, ...gst.env }
		if (!spawnedEnv.DISPLAY) spawnedEnv.DISPLAY = ":0"
		if (!spawnedEnv.XAUTHORITY) {
			const homeDir = os.homedir()
			const candidates = [
				process.env.XAUTHORITY,
				path.join(homeDir, ".Xauthority"),
				`/run/user/${process.getuid?.() ?? 1000}/Xauthority`,
				`/run/user/${process.getuid?.() ?? 1000}/gdm/Xauthority`,
			].filter(Boolean) as string[]

			for (const candidate of candidates) {
				if (fs.existsSync(candidate)) {
					spawnedEnv.XAUTHORITY = candidate
					logger.info(`Xauthority set: ${candidate}`)
					break
				}
			}
		}

		this.process = spawn(gst.gstLaunch, pipelineArgs, { env: spawnedEnv })
		this.process.on("error", async (err) => {
			logger.error(`GStreamer spawn failed: ${err.message}`)
			this.process = null
			await this.cleanup()
			this.emit("capture-failure", err)
			return
		})
		this.process.stdout?.on("data", (data: Buffer) => {
			const output = data.toString()
			if (output.includes("State change") && output.includes("PLAYING")) {
				logger.info("GStreamer pipeline running")
			}
		})

		this.process.stderr?.on("data", (data: Buffer) => {
			let logStr = data.toString()
			logStr = logStr.replace(/auth-token=\S+/g, "auth-token=REDACTED")
			if (
				logStr.includes("ERROR") &&
				logStr.includes("pipeline doesn't want to preroll")
			) {
				if (this.intentionalStop) return
				logger.error(
					"GStreamer pipeline failed to preroll, starting loopback fallback",
				)
				this.intentionalStop = true
				this.stop()
				this.triggerTestFallbackPipeline(whipPort, token)
			} else if (
				logStr.includes("WARN") ||
				logStr.includes("error") ||
				logStr.includes("ERROR")
			) {
				logger.warn(`GStreamer [${this.sessionId}]: ${logStr.trim()}`)
			}
		})

		this.process.on("close", async (code) => {
			logger.info(`GStreamer process exited with status: ${code}`)
			this.process = null
			await this.cleanup()
			if (!this.intentionalStop) {
				this.emit("exit")
			}
		})
	}

	private triggerTestFallbackPipeline(serverPort: number, token: string): void {
		logger.info("Launching loopback video test pattern")
		// (Existing fallback code remains identical)
		const pipelineArgs = [
			"videotestsrc",
			"is-live=true",
			"pattern=ball",
			"!",
			"video/x-raw,framerate=30/1",
			"!",
			"videoconvert",
			"!",
			"vp8enc",
			"deadline=1",
			"keyframe-max-dist=15",
			"target-bitrate=2500000",
			"!",
			"whipclientsink",
			`signaller::whip-endpoint=http://localhost:${serverPort}/api/webrtc/whip?sessionId=${this.sessionId}&token=${token}`,
			`signaller::auth-token=Bearer_${token}`,
		]

		const gst = resolveGstPaths()
		const spawnedEnv = { ...process.env, ...gst.env }
		delete spawnedEnv.DISPLAY
		delete spawnedEnv.XAUTHORITY

		const proc = spawn(gst.gstLaunch, pipelineArgs, { env: spawnedEnv })
		this.process = proc
		this.intentionalStop = false

		proc.stderr?.on("data", (data: Buffer) => {
			logger.warn(
				`GStreamer fallback [${this.sessionId}]: ${data.toString().trim()}`,
			)
		})

		proc.on("close", (code) => {
			logger.info(`GStreamer fallback exited with status: ${code}`)
			this.process = null
			this.emit("exit")
		})
	}

	public stop(): void {
		if (!this.process) return
		logger.info("Terminating GStreamer video pipeline")
		this.process.kill("SIGTERM")
		this.process = null
	}

	private async cleanup(): Promise<void> {
		if (this.provider) {
			await this.provider.dispose()
			this.provider = null
		}
	}
}
