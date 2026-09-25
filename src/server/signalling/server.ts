import type { IncomingMessage, ServerResponse } from "node:http"
import { Transform } from "node:stream"
import logger from "../../utils/logger.ts"
import winston from "winston"
import { getOrCreateActiveToken } from "../tokenStore.ts"
import { GstManager } from "../gstreamer/gstManager.ts"
import { WebRTCManager } from "./webRTC.ts"
import type { InputConfig } from "../types.ts"
import { getLanIp, isLoopbackAddress } from "../../utils/net.ts"
import { requireAuth, parseJsonBody, json } from "./utils.ts"
import {
	loadServerConfig,
	saveServerConfig,
	type ServerConfig,
} from "../../utils/configHelper.ts"

//routes
import { handleSessions, handleLatency, handleLogs } from "./handlers/debug.ts"
import {
	handleOffer,
	handleAnswer,
	handleIce,
	handleSessionSSE,
	handleSessionDelete,
} from "./handlers/rtc.ts"
import {
	handleFileUpload,
	handleFileList,
	handleFileDownload,
	handleFileDelete,
	handleFileEvents,
} from "./handlers/fileShare.ts"
import type { DebugHandlerDeps } from "./handlers/debug.ts"
import type { RtcHandlerDeps } from "./handlers/rtc.ts"

let gstManager: GstManager | null = null
let webrtcManager: WebRTCManager | null = null
let hostStatus: "stopped" | "starting" | "running" | "error" = "stopped"
const lastReportedLatencyMs: { current: number | null } = { current: null }
let signalingAttached = false
let lifecyclePromise: Promise<void> = Promise.resolve()

// ---------------------------------------------------------------------------
// SSE log transport
const sseClients = new Set<ServerResponse>()
const LOG_BUFFER_MAX = 500
const logBuffer: string[] = []

class SseTransport extends winston.transports.Stream {
	constructor() {
		const passthrough = new Transform({
			objectMode: true,
			transform(chunk, _enc, cb) {
				this.push(chunk)
				cb()
			},
		})
		super({ stream: passthrough })
		passthrough.on("data", (info: Record<string, unknown>) => {
			const payload = `data: ${JSON.stringify({
				timestamp: info.timestamp ?? new Date().toISOString(),
				level: String(info.level ?? "info").toUpperCase(),
				message: String(info.message ?? ""),
			})}\n\n`
			// Push to replay buffer
			logBuffer.push(payload)
			if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift()
			for (const res of sseClients) {
				try {
					res.write(payload)
				} catch {
					sseClients.delete(res)
				}
			}
		})
	}
}

logger.add(new SseTransport())

function getEffectiveHostStatus():
	| "stopped"
	| "starting"
	| "running"
	| "error" {
	if (hostStatus === "running" && webrtcManager?.hasError()) return "error"
	return hostStatus
}

// ---------------------------------------------------------------------------

interface MinimalHttpServer {
	close?: (cb?: () => void) => void
}

let storedHttpServer: MinimalHttpServer | null = null

// Route attachment
// biome-ignore lint/suspicious/noExplicitAny: Vite server instance
export function attachSignalingRoutes(server: any): void {
	if (signalingAttached) {
		logger.warn("Signaling routes already attached, skipping")
		return
	}

	const httpServer = server.httpServer || server
	storedHttpServer = httpServer

	try {
		if (!webrtcManager) {
			webrtcManager = new WebRTCManager()
		}

		if (!gstManager) {
			gstManager = new GstManager()
			hostStatus = "starting"
			lifecyclePromise = lifecyclePromise
				.then(async () => {
					if (!gstManager) return
					await gstManager.start()
					hostStatus = "running"
					logger.info("GStreamer capture engine started")
				})
				.catch((err) => {
					logger.error(`Failed to start GStreamer capture engine: ${err}`)
					hostStatus = "error"
				})
		}

		const handleApiRequest = (
			req: IncomingMessage,
			res: ServerResponse,
			next?: () => void,
		) => {
			const url = new URL(
				req.url ?? "",
				`http://${req.headers.host ?? "localhost"}`,
			)
			const { pathname } = url

			if (!pathname.startsWith("/api/")) {
				next?.()
				return
			}

			const remoteAddr = req.socket.remoteAddress

			// ------------------------------------------------------------------

			// Host lifecycle  GET/POST /api/host/*
			if (pathname === "/api/host/start" && req.method === "POST") {
				if (!requireAuth(req, res)) return
				if (hostStatus === "running") {
					json(res, 200, { status: getEffectiveHostStatus() })
					return
				}
				lifecyclePromise = lifecyclePromise
					.then(async () => {
						hostStatus = "starting"
						if (!gstManager) gstManager = new GstManager()
						await gstManager.start()
						hostStatus = "running"
					})
					.catch((err) => {
						logger.error(`Failed to start GStreamer: ${err}`)
						hostStatus = "error"
					})
				json(res, 200, { status: getEffectiveHostStatus() })
				return
			}

			if (pathname === "/api/host/stop" && req.method === "POST") {
				if (!requireAuth(req, res)) return
				lifecyclePromise = lifecyclePromise
					.then(async () => {
						hostStatus = "stopped"
						if (gstManager) {
							await gstManager.stop()
							gstManager = null
						}
					})
					.then(() => {
						json(res, 200, { status: hostStatus })
					})
					.catch((err) => {
						logger.error(`Error stopping GStreamer: ${err}`)
						json(res, 500, { error: "Failed to stop host engine" })
					})
				return
			}

			if (pathname === "/api/host/restart" && req.method === "POST") {
				if (!requireAuth(req, res)) return
				restartServer()
					.then(() =>
						json(res, 200, { ok: true, status: getEffectiveHostStatus() }),
					)
					.catch((err) =>
						json(res, 500, {
							ok: false,
							error: `Failed to restart server: ${String(err)}`,
						}),
					)
				return
			}

			if (pathname === "/api/host/status" && req.method === "GET") {
				if (!requireAuth(req, res)) return
				json(res, 200, { status: getEffectiveHostStatus() })
				return
			}

			if (pathname === "/api/host/ip" && req.method === "GET") {
				if (!requireAuth(req, res)) return
				json(res, 200, { ip: getLanIp() })
				return
			}

			// ------------------------------------------------------------------

			// Auth  POST /api/auth/token  (localhost only)
			if (pathname === "/api/auth/token" && req.method === "POST") {
				if (!isLoopbackAddress(remoteAddr)) {
					json(res, 403, { error: "Localhost only" })
					return
				}
				json(res, 200, { token: getOrCreateActiveToken() })
				return
			}

			const rtcDeps: RtcHandlerDeps = { webrtcManager }

			if (pathname === "/api/rtc/offer" && req.method === "POST") {
				handleOffer(req, res, rtcDeps)
				return
			}

			if (pathname === "/api/rtc/answer" && req.method === "POST") {
				handleAnswer(req, res, rtcDeps)
				return
			}

			if (pathname === "/api/rtc/ice" && req.method === "POST") {
				handleIce(req, res, rtcDeps)
				return
			}

			if (pathname === "/api/rtc/session-sse" && req.method === "GET") {
				handleSessionSSE(req, res, rtcDeps)
				return
			}

			if (pathname === "/api/rtc/session" && req.method === "DELETE") {
				handleSessionDelete(req, res, rtcDeps)
				return
			}

			// ------------------------------------------------------------------
			// Config  POST /api/config
			if (pathname === "/api/config" && req.method === "GET") {
				if (!requireAuth(req, res)) return
				const { framerate, streamQuality, frontendPort } = loadServerConfig()
				json(res, 200, {
					ok: true,
					config: {
						framerate: framerate ?? null,
						streamQuality: streamQuality ?? "performance",
						frontendPort: frontendPort ?? null,
					},
				})
				return
			}

			if (pathname === "/api/config" && req.method === "POST") {
				if (!requireAuth(req, res)) return
				parseJsonBody<
					Partial<InputConfig> & {
						framerate?: number | null
						streamQuality?: string
						frontendPort?: number
					}
				>(req)
					.then(async (config) => {
						const { framerate, streamQuality, frontendPort, ...inputConfig } =
							config
						webrtcManager?.updateConfig(inputConfig)
						// GStreamer and server fields are persisted to writable config and take effect on restart
						const gstFields: Partial<ServerConfig> = {}
						if ("framerate" in config) gstFields.framerate = framerate ?? null
						if ("streamQuality" in config) {
							const q = streamQuality
							if (
								q === "performance" ||
								q === "intermediate" ||
								q === "quality"
							) {
								gstFields.streamQuality = q
							}
						}
						// frontendPort cannot be rebound at runtime — Vite/the HTTP listener
						// was already bound at process startup. Persisting a new value here
						// would create a mismatch between the saved config and the live port.
						// A full process restart (or Vite restart) is required for the port
						// to take effect, so frontendPort is intentionally excluded from the
						// set of runtime-configurable fields.
						const currentCfg = loadServerConfig()
						const hasGstChange =
							("framerate" in config &&
								(framerate ?? null) !== (currentCfg.framerate ?? null)) ||
							("streamQuality" in config &&
								streamQuality !== undefined &&
								streamQuality !== (currentCfg.streamQuality ?? "performance"))

						if (Object.keys(gstFields).length > 0) {
							saveServerConfig(gstFields)
							if (hasGstChange) {
								try {
									await restartServer()
									json(res, 200, { ok: true })
									return
								} catch (err) {
									logger.error(
										`Failed to restart server after config update: ${err}`,
									)
									json(res, 500, {
										ok: false,
										error: `Failed to restart server: ${String(err)}`,
									})
									return
								}
							}
						}
						json(res, 200, { ok: true })
					})
					.catch((err) => {
						json(res, 400, { ok: false, error: String(err) })
					})
				return
			}

			// ------------------------------------------------------------------
			// Debug  GET /api/debug/*
			const debugDeps: DebugHandlerDeps = {
				webrtcManager,
				getEffectiveHostStatus,
				lastReportedLatencyMs,
				sseClients,
				logBuffer,
			}

			if (pathname === "/api/debug/sessions" && req.method === "GET") {
				handleSessions(req, res, debugDeps)
				return
			}

			if (pathname === "/api/debug/report-latency" && req.method === "POST") {
				handleLatency(req, res, debugDeps)
				return
			}

			if (pathname === "/api/debug/logs" && req.method === "GET") {
				handleLogs(req, res, debugDeps)
				return
			}

			// ------------------------------------------------------------------
			// File sharing  /api/files/*
			if (pathname === "/api/files/upload" && req.method === "POST") {
				handleFileUpload(req, res, "host").catch((err) => {
					logger.error(`File upload handler error: ${err}`)
				})
				return
			}

			if (pathname === "/api/files/list" && req.method === "GET") {
				handleFileList(req, res)
				return
			}

			if (pathname === "/api/files/download" && req.method === "GET") {
				handleFileDownload(req, res)
				return
			}

			if (pathname === "/api/files" && req.method === "DELETE") {
				handleFileDelete(req, res)
				return
			}

			if (pathname === "/api/files/events" && req.method === "GET") {
				handleFileEvents(req, res)
				return
			}

			json(res, 404, { error: "API endpoint not found" })
		}

		// Vite dev: inject into its connect middleware stack.
		// Production / Nitro: wire directly onto the raw HTTP server.
		if (server.middlewares) {
			server.middlewares.use(handleApiRequest)
		} else if (httpServer && typeof httpServer.on === "function") {
			const existingListeners = httpServer.listeners("request") as ((
				req: IncomingMessage,
				res: ServerResponse,
			) => void)[]
			httpServer.removeAllListeners("request")
			httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
				const next = () => {
					for (const listener of existingListeners) {
						listener.call(httpServer, req, res)
					}
				}
				handleApiRequest(req, res, next)
			})
		}

		signalingAttached = true
		logger.info("HTTP REST signaling routes attached")
	} catch (err) {
		signalingAttached = false
		throw err
	}
}

export async function stopServer() {
	signalingAttached = false
	if (webrtcManager) await webrtcManager.shutdown()
	if (gstManager) await gstManager.stop()
}

export async function restartServer(): Promise<void> {
	const restart = lifecyclePromise.then(async () => {
		logger.info("Executing full server engine restart...")
		hostStatus = "starting"

		if (gstManager) {
			try {
				await gstManager.stop()
			} catch (err) {
				logger.warn(`Error stopping GStreamer during restart: ${err}`)
			}
			gstManager = null
		}

		if (webrtcManager) {
			try {
				await webrtcManager.shutdown()
			} catch (err) {
				logger.warn(`Error shutting down WebRTC during restart: ${err}`)
			}
			webrtcManager = null
		}

		// 200ms pause ensures OS releases bound UDP sockets (5004/5005) completely
		await new Promise((resolve) => setTimeout(resolve, 200))

		try {
			webrtcManager = new WebRTCManager()
			gstManager = new GstManager()
			await gstManager.start()
			hostStatus = "running"
			logger.info("Server engine successfully restarted")
		} catch (err) {
			hostStatus = "error"
			logger.error(`Failed to start server engine during restart: ${err}`)
			throw err
		}
	})
	lifecyclePromise = restart.catch(() => undefined)
	return restart
}

if (typeof process !== "undefined") {
	const handleExitSignal = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down server...`)
		try {
			await stopServer()
			if (storedHttpServer && typeof storedHttpServer.close === "function") {
				const serverInstance = storedHttpServer
				await new Promise<void>((resolve) => {
					serverInstance.close?.(() => resolve())
				})
			}
		} catch (err) {
			logger.error(`Error shutting down server on ${signal}: ${err}`)
		} finally {
			process.exit(0)
		}
	}
	process.once("SIGINT", () => {
		handleExitSignal("SIGINT")
	})
	process.once("SIGTERM", () => {
		handleExitSignal("SIGTERM")
	})
}
