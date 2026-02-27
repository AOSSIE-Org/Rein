import fs from "node:fs"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import os from "node:os"
import { type WebSocket, WebSocketServer } from "ws"
import logger from "../utils/logger"
import { InputHandler, type InputMessage } from "./InputHandler"
import type { Server as HttpServer } from "node:http"
import type { Server as HttpsServer } from "node:https"

type CompatibleServer = HttpServer | HttpsServer

import {
	generateToken,
	getActiveToken,
	isKnownToken,
	storeToken,
	touchToken,
	createPairingRequest,
	getPendingPairingRequests,
	approvePairingRequest,
	rejectPairingRequest,
} from "./tokenStore"

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

// server: any is used to support Vite's dynamic httpServer types (http, https, http2)
export function createWsServer(server: CompatibleServer) {
	const configPath = "./src/server-config.json"
	let serverConfig: Record<string, unknown> = {}

	// keep track of sockets waiting for pairing approval
	const pendingPairingSockets = new Map<string, WebSocket>()
	if (fs.existsSync(configPath)) {
		try {
			serverConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>
		} catch (e) {
			logger.warn(`Invalid server-config.json, using defaults: ${String(e)}`)
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
	const MAX_PAYLOAD_SIZE = 10 * 1024 // 10KB limit

	logger.info("WebSocket server initialized")

	server.on(
		"upgrade",
		(request: IncomingMessage, socket: Socket, head: Buffer) => {
			const url = new URL(request.url || "", `http://${request.headers.host}`)

			if (url.pathname !== "/ws") return

			const token = url.searchParams.get("token")
			const local = isLocalhost(request)

			logger.info(
				`Upgrade request received from ${request.socket.remoteAddress}`,
			)

			if (local) {
				logger.info("Localhost connection allowed")
				wss.handleUpgrade(request, socket, head, (ws) => {
					wss.emit("connection", ws, request, token, true)
				})
				return
			}

// Remote connections normally require a token, but we allow a
		// temporary unauthenticated websocket so that a client can send a
		// pairing request. Actual input messages will still be blocked later.
		let tokenValid = false

		if (token) {
			// Validate against known tokens
			if (isKnownToken(token)) {
				tokenValid = true
			} else {
				logger.warn("Unauthorized connection attempt: Invalid token")
				// continue anyway; connections without valid token can still
				// request pairing but cannot send input events
			}
		} else if (!local) {
			// no token on remote; allow upgrade for pairing flow
			logger.info("Remote connection without token, allowing for pairing")
			}

			logger.info("Remote connection authenticated successfully")

			wss.handleUpgrade(request, socket, head, (ws) => {
				wss.emit("connection", ws, request, token, false)
			})
		},
	)

	wss.on(
		"connection",
		(
			ws: WebSocket,
			request: IncomingMessage,
			token: string | null,
			isLocal: boolean,
		) => {
			// Localhost: only store token if it's already known (trusted scan)
			// Remote: token may or may not be valid; messages will be checked later
			logger.info(`Client connected from ${request.socket.remoteAddress}`)

			// determine whether this connection has a valid token for input
			const authorized = token !== null && isKnownToken(token)
			if (authorized) {
				storeToken(token!)
			}

			ws.send(JSON.stringify({ type: "connected", serverIp: LAN_IP }))

			let lastTokenTouch = 0

			ws.on("message", async (data: WebSocket.RawData) => {
				try {
					const raw = data.toString()
					const now = Date.now()

					if (raw.length > MAX_PAYLOAD_SIZE) {
						logger.warn("Payload too large, rejecting message.")
						return
					}

					const msg = JSON.parse(raw)

					// Throttle token touch to once per second — avoids crypto comparison on every event
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
							logger.warn("Token generation attempt from non-localhost")
							ws.send(
								JSON.stringify({
									type: "auth-error",
									error: "Only localhost can generate tokens",
								}),
							)
							return
						}

						// Idempotent: return active token if one exists
						let tokenToReturn = getActiveToken()
						if (!tokenToReturn) {
							tokenToReturn = generateToken()
							storeToken(tokenToReturn)
							logger.info("New token generated")
						} else {
							logger.info("Existing active token returned")
						}

						ws.send(
							JSON.stringify({ type: "token-generated", token: tokenToReturn }),
						)
						return
					}

					if (msg.type === "request-pairing") {
						// Mobile device requests pairing
						if (isLocal) {
							logger.warn("Localhost cannot request pairing")
							ws.send(
								JSON.stringify({
									type: "pairing-error",
									error: "Localhost cannot request pairing",
								}),
							)
							return
						}

						const deviceName = msg.deviceName || "Unknown Device"
						const userAgent = msg.userAgent || "Unknown"

						const requestId = createPairingRequest(deviceName, userAgent)
						logger.info(`Pairing request created: ${requestId} from ${deviceName}`)

				// remember this socket so we can notify when approved/rejected
				pendingPairingSockets.set(requestId, ws)

							)
							return
						}

						const pendingRequests = getPendingPairingRequests()
						ws.send(
							JSON.stringify({
								type: "pending-pairings",
								requests: pendingRequests,
							}),
						)
						return
					}

					if (msg.type === "approve-pairing") {
						// Only localhost can approve pairings
						if (!isLocal) {
							logger.warn("Non-localhost attempted to approve pairing")
							ws.send(
								JSON.stringify({
									type: "auth-error",
									error: "Only localhost can approve pairings",
								}),
							)
							return
						}

						const requestId = msg.requestId
						if (!requestId || typeof requestId !== "string") {
							ws.send(
								JSON.stringify({
									type: "pairing-error",
									error: "Invalid requestId",
								}),
							)
							return
						}

						const approvedToken = approvePairingRequest(requestId)
						if (!approvedToken) {
							ws.send(
								JSON.stringify({
									type: "pairing-error",
									error: "Pairing request not found or expired",
								}),
							)
							return
						}

						logger.info(`Pairing approved: ${requestId}`)
					// notify original device if still connected
					const pendingSocket = pendingPairingSockets.get(requestId)
					if (pendingSocket && pendingSocket.readyState === WebSocket.OPEN) {
						pendingSocket.send(
							JSON.stringify({
								type: "pairing-approved",
								requestId,
								token: approvedToken,
								message: "Device pairing approved",
							}),
						)
					}
					pendingPairingSockets.delete(requestId)


						const rejected = rejectPairingRequest(requestId)
						if (!rejected) {
							ws.send(
								JSON.stringify({
									type: "pairing-error",
									error: "Pairing request not found or already expired",
								}),
							)
							return
						}

						logger.info(`Pairing rejected: ${requestId}`)
					// notify original device as well
					const pendingSocket = pendingPairingSockets.get(requestId)
					if (pendingSocket && pendingSocket.readyState === WebSocket.OPEN) {
						pendingSocket.send(
							JSON.stringify({
								type: "pairing-rejected",
								requestId,
								message: "Device pairing rejected",
							}),
						)
					}
					pendingPairingSockets.delete(requestId)


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

							// Propagate inputThrottleMs immediately to live subsystems
							if (typeof filtered.inputThrottleMs === "number") {
								inputHandler.setThrottleMs(filtered.inputThrottleMs)
							}

							logger.info("Server configuration updated")
							ws.send(JSON.stringify({ type: "config-updated", success: true }))
						} catch (e) {
							logger.error(`Failed to update config: ${String(e)}`)
							ws.send(
								JSON.stringify({
									type: "config-updated",
									success: false,
									error: String(e),
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
					]
					if (!msg.type || !VALID_INPUT_TYPES.includes(msg.type)) {
						logger.warn(`Unknown message type: ${msg.type}`)
						return
					}

					// enforce authorization for input events
				if (!authorized) {
					logger.warn("Client attempted input without valid token")
					return
				}
				await inputHandler.handleMessage(msg as InputMessage)
				} catch (err: unknown) {
					logger.error(
						`Error processing message: ${
							err instanceof Error ? err.message : String(err)
						}`,
					)
				}
			})

			ws.on("close", () => {
				logger.info("Client disconnected")
				// remove from pending pairing map if present
				for (const [reqId, sock] of pendingPairingSockets.entries()) {
					if (sock === ws) {
						pendingPairingSockets.delete(reqId)
						break
					}
				}
			})

			ws.on("error", (error: Error) => {
				console.error("WebSocket error:", error)
				logger.error(`WebSocket error: ${error.message}`)
			})
		},
	)
}
