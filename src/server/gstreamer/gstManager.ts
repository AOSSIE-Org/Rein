import { spawn, execSync, type ChildProcess } from "node:child_process"
import os from "node:os"
import fs from "node:fs"
import path from "node:path"
import logger from "../../utils/logger.ts"
import {
	type CaptureProvider,
	createCaptureProvider,
} from "./captureProvider.ts"
import { resolveGstPaths } from "./gstPaths.ts"
import { RTP_HOST, RTP_PORT, RTP_PORT_AUDIO } from "../constants.ts"
import {
	loadServerConfig,
	type ServerConfig,
} from "../../utils/configHelper.ts"

export class GstManager {
	private process: ChildProcess | null = null
	private provider: CaptureProvider | null = null
	private stopping = false

	private getAudioSourceBlocks(cfg: ServerConfig): string[] {
		if (cfg.audioSource) {
			return cfg.audioSource.trim().split(/\s+/)
		}
		const platform = os.platform()
		if (platform === "win32") {
			return ["wasapisrc", "loopback=true"]
		}
		if (platform === "darwin") {
			return ["osxaudiosrc"]
		}

		// Linux (default to pulsesrc with default sink monitor)
		try {
			const sink = execSync("pactl get-default-sink", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim()
			if (sink) {
				logger.info(`Detected default audio sink: ${sink}`)
				return ["pulsesrc", `device=${sink}.monitor`]
			}
		} catch (e) {
			logger.warn(`Failed to auto-detect monitor sink: ${String(e)}`)
		}
		return ["pulsesrc"]
	}

	private getX264Params(quality: string): string[] {
		const validQuality: "performance" | "intermediate" | "quality" =
			quality === "intermediate" || quality === "quality"
				? quality
				: "performance"
		const presets = {
			performance: [
				"tune=zerolatency",
				"speed-preset=ultrafast",
				"key-int-max=30",
				"bitrate=2000",
				"byte-stream=false",
			],
			intermediate: [
				"tune=zerolatency",
				"speed-preset=superfast",
				"key-int-max=30",
				"bitrate=4000",
				"byte-stream=false",
				"cabac=false",
				"vbv-buf-capacity=600",
			],
			quality: [
				"tune=zerolatency",
				"speed-preset=veryfast",
				"key-int-max=30",
				"bitrate=8000",
				"byte-stream=false",
				"cabac=false",
				"vbv-buf-capacity=500",
			],
		} as const
		return [...presets[validQuality]]
	}

	private buildPipelineArgs(sourceBlocks: string[]): string[] {
		const args = [...sourceBlocks]
		const cfg = loadServerConfig()
		// framerate: null/undefined → omit videorate and the framerate cap so
		// GStreamer passes frames at the source's native rate.
		const framerate =
			typeof cfg.framerate === "number" && cfg.framerate > 0
				? cfg.framerate
				: null

		args.push(
			"!",
			"queue",
			"max-size-buffers=1",
			"leaky=downstream",
			"!",
			"videoconvert",
		)

		if (framerate !== null) {
			args.push("!", "videorate", "!", `video/x-raw,framerate=${framerate}/1`)
		}

		const quality = cfg.streamQuality ?? "performance"
		const x264Params = this.getX264Params(quality)

		args.push(
			"!",
			"x264enc",
			...x264Params,
			"!",
			"h264parse",
			"!",
			"video/x-h264,profile=baseline",
			"!",
			"rtph264pay",
			"config-interval=-1",
			"pt=96",
			"!",
			"udpsink",
			`host=${RTP_HOST}`,
			`port=${RTP_PORT}`,
			"sync=false",
			"async=false",
		)

		// Audio pipeline branch (independent chain)
		const audioSource = this.getAudioSourceBlocks(cfg)
		args.push(
			...audioSource,
			"!",
			"queue",
			"max-size-buffers=10",
			"leaky=downstream",
			"!",
			"audioconvert",
			"!",
			"audioresample",
			"!",
			"audio/x-raw,rate=48000,channels=2",
			"!",
			"opusenc",
			"!",
			"rtpopuspay",
			"pt=111",
			"!",
			"udpsink",
			`host=${RTP_HOST}`,
			`port=${RTP_PORT_AUDIO}`,
			"sync=false",
			"async=false",
		)

		return args
	}

	public async start(): Promise<void> {
		if (this.process || this.stopping) return

		logger.info("Spawning GStreamer UDP engine")

		try {
			this.provider = createCaptureProvider()
			await this.provider.initialize(async (err) => {
				logger.error(`Capture provider failed after startup: ${err.message}`)
				await this.stop()
			})
			const sourceBlocks = await this.provider.getGStreamerSource()
			const pipelineArgs = this.buildPipelineArgs(sourceBlocks)
			this.executePipeline(pipelineArgs)
		} catch (error) {
			logger.error(`Capture initialization failed: ${String(error)}`)
			await this.cleanup()
			throw error
		}
	}

	private executePipeline(pipelineArgs: string[]): void {
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

		logger.info(`GStreamer args: gst-launch-1.0 ${pipelineArgs.join(" ")}`)
		this.process = spawn(gst.gstLaunch, pipelineArgs, { env: spawnedEnv })

		this.process.on("error", async (err) => {
			logger.error(`GStreamer spawn failed: ${err.message}`)
			this.process = null
			await this.cleanup()
			return
		})

		this.process.stdout?.on("data", (data: Buffer) => {
			const output = data.toString()
			if (output.includes("State change") && output.includes("PLAYING")) {
				logger.info("GStreamer pipeline running")
			}
		})

		this.process.stderr?.on("data", (data: Buffer) => {
			const logStr = data.toString()
			if (
				logStr.includes("WARN") ||
				logStr.includes("error") ||
				logStr.includes("ERROR")
			) {
				logger.warn(`GStreamer: ${logStr.trim()}`)
			}
		})

		this.process.on("close", async (code) => {
			logger.info(`GStreamer process exited with status: ${code}`)
			this.process = null
			await this.cleanup()
		})
	}

	public async stop(): Promise<void> {
		if (this.process) {
			logger.info("Terminating GStreamer video pipeline")
			const proc = this.process
			this.stopping = true
			await new Promise<void>((resolve) => {
				const killTimer = setTimeout(() => {
					if (proc.exitCode === null) {
						logger.warn(
							"GStreamer process did not exit on SIGTERM, sending SIGKILL",
						)
						proc.kill("SIGKILL")
					}
				}, 2000)
				proc.once("close", () => {
					clearTimeout(killTimer)
					resolve()
				})
				proc.kill("SIGTERM")
			})
			this.process = null
			this.stopping = false
		}
		await this.cleanup()
	}

	private async cleanup(): Promise<void> {
		if (this.provider) {
			await this.provider.dispose()
			this.provider = null
		}
	}
}
