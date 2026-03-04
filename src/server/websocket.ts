import fs from "node:fs"
import type { IncomingMessage, Server as HttpServer } from "node:http"
import type { Server as HttpsServer } from "node:https"
import type { Socket } from "node:net"
import os from "node:os"
import { WebSocket, WebSocketServer } from "ws"
import { logger } from "../utils/logger"
import { InputHandler, type InputMessage } from "./InputHandler"
import {
	generateToken,
	getActiveToken,
	isKnownToken,
	storeToken,
	touchToken,
} from "./tokenStore"

type CompatibleServer = HttpServer | HttpsServer

function getLocalIp(): string {
	const nets = os.networkInterfaces()
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] ?? []) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address
			}
		}
	}
	return "localhost"
}

function isLocalhost(request: IncomingMessage): boolean {
	const addr = request.socket.remoteAddress
	if (!addr) return false
	return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}

interface ExtWebSocket extends WebSocket {
	isConsumer?: boolean
	isProvider?: boolean
}

export function createWsServer(server: CompatibleServer) {
	const configPath = "./src/server-config.json"
	let serverConfig: Record<string, unknown> = {}
	if (fs.existsSync(configPath)) {
		try {
			serverConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>
		} catch (error) {
			logger.warn(`Config load failed: ${String(error)}`)
		}
	}

	const inputThrottleMs =
		typeof serverConfig.inputThrottleMs === "number" &&
		serverConfig.inputThrottleMs > 0
			? serverConfig.inputThrottleMs
			: 8

	const wss = new WebSocketServer({ noServer: true })
	const inputHandler = new InputHandler(inputThrottleMs)
	const LAN_IP = getLocalIp()
	const MAX_PAYLOAD_SIZE = 10 * 1024

	logger.info("[WS] Server initialized")

	server.on(
		"upgrade",
		(request: IncomingMessage, socket: Socket, head: Buffer) => {
			const url = new URL(request.url || "", `http://${request.headers.host}`)

			if (url.pathname !== "/ws") return

			const token = url.searchParams.get("token")
			const local = isLocalhost(request)

			logger.debug("[WS] Upgrade request received")

			if (local) {
				logger.debug("[WS] Localhost connection accepted")
				wss.handleUpgrade(request, socket, head, (ws) => {
					wss.emit("connection", ws, request, token, true)
				})
				return
			}

			if (!token) {
				logger.warn("[WS] Connection rejected: no token provided")
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
				socket.destroy()
				return
			}

			if (!isKnownToken(token)) {
				logger.warn("[WS] Connection rejected: invalid token")
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
				socket.destroy()
				return
			}

			logger.info("[WS] Remote connection authenticated")

			wss.handleUpgrade(request, socket, head, (ws) => {
				wss.emit("connection", ws, request, token, false)
			})
		},
	)

	wss.on(
		"connection",
		(
			ws: WebSocket,
			_request: IncomingMessage,
			token: string | null,
			isLocal: boolean,
		) => {
			logger.debug("[WS] Client connected")

			if (token && (isKnownToken(token) || !isLocal)) {
				storeToken(token)
			}

			ws.send(JSON.stringify({ type: "connected", serverIp: LAN_IP }))

			let lastTokenTouch = 0

			const startMirror = () => {
				;(ws as ExtWebSocket).isConsumer = true
				logger.debug("[WS] Client registered as consumer")
			}

			const stopMirror = () => {
				;(ws as ExtWebSocket).isConsumer = false
				logger.debug("[WS] Client unregistered as consumer")
			}

			ws.on("message", async (data: WebSocket.RawData, isBinary: boolean) => {
				try {
					if (isBinary) {
						if ((ws as ExtWebSocket).isProvider) {
							for (const client of wss.clients) {
								if (
									client !== ws &&
									(client as ExtWebSocket).isConsumer &&
									client.readyState === WebSocket.OPEN
								) {
									client.send(data, { binary: true })
								}
							}
						}
						return
					}

					const raw = data.toString()
					const now = Date.now()

					if (raw.length > MAX_PAYLOAD_SIZE) {
						logger.warn("[WS] Message rejected: payload too large")
						return
					}

					const msg = JSON.parse(raw) as {
						type: string
						config?: Record<string, unknown>
					}

					if (token && msg.type !== "get-ip" && msg.type !== "generate-token") {
						if (now - lastTokenTouch > 1000) {
							lastTokenTouch = now
							touchToken(token)
						}
					}

					if (msg.type === "get-ip") {
						ws.send(JSON.stringify({ type: "server-ip", ip: LAN_IP }))
						return
					}

					if (msg.type === "generate-token") {
						if (!isLocal) {
							logger.warn(
								"[WS] Token generation rejected: non-localhost request",
							)
							ws.send(
								JSON.stringify({
									type: "auth-error",
									error: "Only localhost can generate tokens",
								}),
							)
							return
						}

						let tokenToReturn = getActiveToken()
						if (!tokenToReturn) {
							tokenToReturn = generateToken()
							storeToken(tokenToReturn)
							logger.info("[WS] New token generated")
						} else {
							logger.info("[WS] Active token returned")
						}

						ws.send(
							JSON.stringify({ type: "token-generated", token: tokenToReturn }),
						)
						return
					}

					if (msg.type === "start-mirror") {
						startMirror()
						return
					}

					if (msg.type === "stop-mirror") {
						stopMirror()
						return
					}

					if (msg.type === "start-provider") {
						;(ws as ExtWebSocket).isProvider = true
						logger.debug("[WS] Client registered as provider")
						return
					}

					if (msg.type === "update-config") {
						try {
							if (
								!msg.config ||
								typeof msg.config !== "object" ||
								Array.isArray(msg.config)
							) {
								ws.send(
									JSON.stringify({
										type: "config-updated",
										success: false,
										error: "Invalid config payload",
									}),
								)
								return
							}

							const SERVER_CONFIG_KEYS = [
								"host",
								"frontendPort",
								"address",
								"inputThrottleMs",
							]
							const filtered: Record<string, unknown> = {}

							for (const key of SERVER_CONFIG_KEYS) {
								if (!(key in msg.config)) continue

								if (key === "frontendPort") {
									const port = Number(msg.config[key])
									if (
										!Number.isFinite(port) ||
										port < 1 ||
										port > 65535 ||
										Math.floor(port) !== port
									) {
										ws.send(
											JSON.stringify({
												type: "config-updated",
												success: false,
												error: "Invalid port number (must be 1–65535)",
											}),
										)
										return
									}
									filtered[key] = port
								} else if (key === "inputThrottleMs") {
									const ms = Number(msg.config[key])
									if (!Number.isFinite(ms) || ms < 1 || ms > 1000) {
										ws.send(
											JSON.stringify({
												type: "config-updated",
												success: false,
												error: "Invalid inputThrottleMs (must be 1–1000)",
											}),
										)
										return
									}
									filtered[key] = ms
								} else if (
									typeof msg.config[key] === "string" &&
									msg.config[key].length <= 255
								) {
									filtered[key] = msg.config[key]
								}
							}

							if (Object.keys(filtered).length === 0) {
								ws.send(
									JSON.stringify({
										type: "config-updated",
										success: false,
										error: "No valid config keys provided",
									}),
								)
								return
							}

							const configPath = "./src/server-config.json"
							const current = fs.existsSync(configPath)
								? JSON.parse(fs.readFileSync(configPath, "utf-8"))
								: {}
							const newConfig = { ...current, ...filtered }
							fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2))

							if (typeof filtered.inputThrottleMs === "number") {
								inputHandler.setThrottleMs(filtered.inputThrottleMs)
							}

							logger.info("[WS] Server config updated")
							ws.send(JSON.stringify({ type: "config-updated", success: true }))
						} catch (configError) {
							logger.error(`[WS] Config update failed: ${String(configError)}`)
							ws.send(
								JSON.stringify({
									type: "config-updated",
									success: false,
									error: String(configError),
								}),
							)
						}
						return
					}

					const VALID_INPUT_TYPES = [
						"move",
						"click",
						"scroll",
						"key",
						"text",
						"zoom",
						"combo",
						"copy",
						"paste",
					]
					if (!msg.type || !VALID_INPUT_TYPES.includes(msg.type)) {
						logger.warn(`[WS] Unknown message type: ${msg.type}`)
						return
					}

					await inputHandler.handleMessage(msg as InputMessage)
				} catch (err: unknown) {
					logger.error(
						`[WS] Message processing failed: ${
							err instanceof Error ? err.message : String(err)
						}`,
					)
				}
			})

			ws.on("close", () => {
				stopMirror()
				logger.debug("[WS] Client disconnected")
			})

			ws.on("error", (error: Error) => {
				logger.error(`[WS] Socket error: ${error.message}`)
			})
		},
	)
}
