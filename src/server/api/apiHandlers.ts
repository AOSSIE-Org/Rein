/**
 * Request handlers and authorization middleware for the HTTP signaling layer.
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import crypto from "node:crypto"
import logger from "../../utils/logger"
import {
	getActiveToken,
	isKnownToken,
	touchToken,
	generateToken,
	storeToken,
} from "../tokenStore"
import { InputPeerConnection } from "./InputPeerConnection"
import { getLocalIp } from "./getLocalIp"
import type { InputConfig } from "../types"
import {
	sessions,
	sseClients,
	inputConnections,
	hostStatus,
	runnerInstance,
	pendingConfigUpdates,
	setHostStatus,
	setRunnerInstance,
	setPendingConfigUpdates,
	pushEvent,
	ensureHostRunnerActive,
} from "./apiState"

// --- Auth & Request Utilities ---

export function isLocalRequest(req: IncomingMessage): boolean {
	const addr = req.socket.remoteAddress
	if (!addr) return false
	return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}

export function requireLocalhost(
	req: IncomingMessage,
	res: ServerResponse,
): boolean {
	if (isLocalRequest(req)) return true
	res.writeHead(403, { "Content-Type": "application/json" })
	res.end(JSON.stringify({ error: "Localhost only" }))
	return false
}

export function requireAuth(
	req: IncomingMessage,
	res: ServerResponse,
): boolean {
	if (isLocalRequest(req)) return true

	const authHeader = req.headers.authorization ?? ""
	let token = authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: null

	if (!token) {
		const url = new URL(req.url ?? "", `http://${req.headers.host}`)
		token = url.searchParams.get("token")
	}

	if (!token || !isKnownToken(token)) {
		res.writeHead(401, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ error: "Unauthorized" }))
		return false
	}

	touchToken(token)
	return true
}

export function json(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body)
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	})
	res.end(payload)
}

export async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let raw = ""
		req.setEncoding("utf-8")
		req.on("data", (chunk: string) => {
			raw += chunk
			if (raw.length > 64 * 1024) {
				req.destroy()
				reject(new Error("Request body too large"))
			}
		})
		req.on("end", () => resolve(raw))
		req.on("error", reject)
	})
}

// --- Route Handlers ---

export async function handleCreateSession(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	try {
		const session = {
			id: crypto.randomUUID(),
			createdAt: Date.now(),
			state: "pending" as const,
			offer: null,
			answer: null,
			viewerIce: [],
			hostIce: [],
		}
		sessions.set(session.id, session)
		logger.info(`Session created: ${session.id}`)

		const hostHeader = req.headers.host || "127.0.0.1:8000"
		ensureHostRunnerActive(`http://${hostHeader}`)

		const protocol = req.headers["x-forwarded-proto"] ?? "http"
		const host = req.headers.host ?? "localhost"
		const viewerUrl = `${protocol}://${host}/trackpad?session=${session.id}`
		json(res, 201, { sessionId: session.id, viewerUrl })
	} catch (_err) {
		json(res, 500, {
			error: "Failed to initialize and bind session host runtime cleanly",
		})
	}
}

export function handleGetSession(
	req: IncomingMessage,
	res: ServerResponse,
	sessionId: string,
): void {
	if (!requireAuth(req, res)) return

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}

	json(res, 200, {
		id: session.id,
		state: session.state,
		createdAt: session.createdAt,
		hasOffer: session.offer !== null,
		hasAnswer: session.answer !== null,
		viewerIceCandidates: session.viewerIce.length,
		hostIceCandidates: session.hostIce.length,
	})
}

export function handleDeleteSession(
	req: IncomingMessage,
	res: ServerResponse,
	sessionId: string,
): void {
	if (!requireAuth(req, res)) return

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}

	session.state = "closed"
	sessions.delete(sessionId)
	pushEvent(sessionId, "session-closed", { sessionId })
	sseClients.delete(sessionId)
	inputConnections.get(sessionId)?.close()
	inputConnections.delete(sessionId)
	logger.info(`Session deleted: ${sessionId}`)
	json(res, 200, { ok: true })
}

export async function handleOffer(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	const bodyText = await readBody(req)
	const { sessionId, sdp } = JSON.parse(bodyText || "{}")

	if (!sessionId || typeof sdp !== "string") {
		json(res, 400, { error: "sessionId and sdp are required" })
		return
	}

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}
	if (session.state !== "pending") {
		json(res, 409, {
			error: `Session is in state '${session.state}', expected 'pending'`,
		})
		return
	}

	session.offer = sdp
	session.state = "offering"
	logger.info(`SDP offer received for session ${sessionId}`)

	pushEvent(sessionId, "offer", { sessionId, sdp })

	const hostHeader = req.headers.host || "127.0.0.1:8000"
	const runner = ensureHostRunnerActive(`http://${hostHeader}`)
	runner.handleIncomingClientOffer(sessionId, sdp)

	json(res, 200, { ok: true })
}

export async function handleAnswer(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	const bodyText = await readBody(req)
	const { sessionId, sdp } = JSON.parse(bodyText || "{}")

	if (!sessionId || typeof sdp !== "string") {
		json(res, 400, { error: "sessionId and sdp are required" })
		return
	}

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}

	session.answer = sdp
	session.state = "answered"
	logger.info(`SDP answer stored for session ${sessionId}`)

	pushEvent(sessionId, "answer", { sessionId, sdp })
	json(res, 200, { ok: true })
}

export async function handleIce(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	const bodyText = await readBody(req)
	const body = JSON.parse(bodyText || "{}")
	const { sessionId, candidate, sdpMid, sdpMLineIndex, from } = body

	if (!sessionId || typeof candidate !== "string" || !from) {
		json(res, 400, { error: "sessionId, candidate, and from are required" })
		return
	}

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}

	const ice = {
		candidate,
		sdpMid: sdpMid ?? null,
		sdpMLineIndex: sdpMLineIndex ?? null,
	}
	if (from === "viewer-input") {
		const inputPc = inputConnections.get(sessionId)
		if (inputPc && ice.sdpMid !== null) {
			inputPc.addRemoteCandidate(ice.candidate, ice.sdpMid)
		}
		json(res, 200, { ok: true })
		return
	} else if (from === "viewer") {
		session.viewerIce.push(ice)
		pushEvent(sessionId, "viewer-ice", { sessionId, ...ice })
	} else {
		session.hostIce.push(ice)
		pushEvent(sessionId, "host-ice", { sessionId, ...ice })
	}

	json(res, 200, { ok: true })
}

export function handleEvents(req: IncomingMessage, res: ServerResponse): void {
	if (!requireAuth(req, res)) return

	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const sessionId = url.searchParams.get("sessionId")

	if (!sessionId) {
		json(res, 400, { error: "sessionId query param required" })
		return
	}

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Session not found" })
		return
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	})
	res.flushHeaders()

	if (!sseClients.has(sessionId)) {
		sseClients.set(sessionId, new Set())
	}
	sseClients.get(sessionId)?.add(res)

	if (!session.offer && runnerInstance) {
		logger.info(
			`SSE viewer connected — starting GStreamer pipeline for session: ${sessionId}`,
		)
		runnerInstance.handleIncomingClientOffer(sessionId, "")
	}

	if (session.offer) {
		res.write(
			`event: offer\ndata: ${JSON.stringify({ sessionId: session.id, sdp: session.offer })}\n\n`,
		)
	}
	if (session.answer) {
		res.write(
			`event: answer\ndata: ${JSON.stringify({ sessionId: session.id, sdp: session.answer })}\n\n`,
		)
	}
	for (const ice of session.viewerIce) {
		res.write(
			`event: viewer-ice\ndata: ${JSON.stringify({ sessionId: session.id, ...ice })}\n\n`,
		)
	}
	for (const ice of session.hostIce) {
		res.write(
			`event: host-ice\ndata: ${JSON.stringify({ sessionId: session.id, ...ice })}\n\n`,
		)
	}

	const keepAlive = setInterval(() => {
		try {
			res.write(": keepalive\n\n")
		} catch {
			clearInterval(keepAlive)
		}
	}, 15_000)

	req.on("close", () => {
		clearInterval(keepAlive)
		sseClients.get(sessionId)?.delete(res)
		logger.info(`SSE client disconnected from session ${sessionId}`)
	})

	logger.info(`SSE client connected to session ${sessionId}`)
}

export async function handleGstSignalingGateway(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const sessionId = url.searchParams.get("sessionId")

	if (!sessionId) {
		json(res, 400, { error: "sessionId target query missing" })
		return
	}

	const bodyText = await readBody(req)
	try {
		const msg = JSON.parse(bodyText)

		if (msg.type === "answer") {
			logger.info(`GStreamer SDP answer received for session: ${sessionId}`)
			pushEvent(sessionId, "answer", { sessionId, sdp: msg.sdp })
		} else if (msg.candidate) {
			pushEvent(sessionId, "host-ice", {
				sessionId,
				candidate: msg.candidate,
				sdpMid: msg.sdpMid,
				sdpMLineIndex: msg.sdpMLineIndex,
			})
		}
		json(res, 200, { status: "ok" })
	} catch (_err) {
		json(res, 400, { error: "Inbound parsing crash" })
	}
}

export async function handleHostStart(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireLocalhost(req, res)) return
	if (hostStatus === "running" || hostStatus === "starting") {
		json(res, 409, { error: `Host already ${hostStatus}` })
		return
	}
	try {
		const hostHeader = req.headers.host || "127.0.0.1:8000"
		ensureHostRunnerActive(`http://${hostHeader}`)
		json(res, 200, { status: hostStatus })
	} catch (err) {
		json(res, 500, { error: String(err) })
	}
}

export async function handleHostStop(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireLocalhost(req, res)) return
	if (hostStatus === "stopped" || !runnerInstance) {
		json(res, 409, { error: "Host is not running" })
		return
	}

	runnerInstance.shutdown()
	setRunnerInstance(null)
	setHostStatus("stopped")
	json(res, 200, { status: hostStatus })
}

export function handleHostStatus(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return
	json(res, 200, { status: hostStatus })
}

export async function handleGenerateToken(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireLocalhost(req, res)) return

	let token = getActiveToken()
	if (!token) {
		token = generateToken()
		storeToken(token)
	}
	json(res, 200, { token })
}

export function handleGetToken(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireLocalhost(req, res)) return
	const token = getActiveToken()
	if (!token) {
		json(res, 404, { error: "No active token" })
		return
	}
	json(res, 200, { token })
}

export async function handleInputOffer(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	const bodyText = await readBody(req)
	const { sessionId, sdp } = JSON.parse(bodyText || "{}") as {
		sessionId?: string
		sdp?: string
	}

	if (!sessionId || typeof sdp !== "string") {
		json(res, 400, { error: "sessionId and sdp are required" })
		return
	}
	if (!sessions.has(sessionId)) {
		json(res, 404, { error: "Session not found" })
		return
	}
	if (inputConnections.has(sessionId)) {
		json(res, 200, { ok: true })
		return
	}

	let initialSensitivity = 1.0
	let initialInvertScroll = false
	try {
		const configPath = "./src/server-config.json"
		if (fs.existsSync(configPath)) {
			const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
			if (typeof cfg.sensitivity === "number")
				initialSensitivity = cfg.sensitivity
			if (typeof cfg.invertScroll === "boolean")
				initialInvertScroll = cfg.invertScroll
		}
	} catch (e) {
		logger.warn(
			`Failed to read initial config from server-config.json: ${String(e)}`,
		)
	}

	const inputPc = new InputPeerConnection(
		sessionId,
		(candidate, mid) => {
			pushEvent(sessionId, "input-ice", {
				sessionId,
				candidate,
				sdpMid: mid,
				sdpMLineIndex: null,
			})
		},
		{ sensitivity: initialSensitivity, invertScroll: initialInvertScroll },
		() => {
			logger.info(`Input connection closed: ${sessionId}`)
			inputConnections.delete(sessionId)
		},
	)
	inputConnections.set(sessionId, inputPc)

	try {
		const answerSdp = await inputPc.processOffer(sdp)
		pushEvent(sessionId, "input-answer", { sessionId, sdp: answerSdp })
		logger.info(`[Input] Answer dispatched via SSE for: ${sessionId}`)
		json(res, 200, { ok: true })
	} catch (err) {
		inputConnections.delete(sessionId)
		inputPc.close()
		json(res, 500, { error: String(err) })
	}
}

export async function handleGetIp(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return
	try {
		const ip = await getLocalIp()
		json(res, 200, { ip })
	} catch (err) {
		logger.error(`Failed to get local IP: ${String(err)}`)
		json(res, 500, { error: "Failed to get local IP" })
	}
}

export async function handleUpdateConfig(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	try {
		const bodyText = await readBody(req)
		const body = JSON.parse(bodyText || "{}") as Record<string, unknown>

		const configPath = "./src/server-config.json"
		const SERVER_CONFIG_KEYS = [
			"host",
			"frontendPort",
			"address",
			"inputThrottleMs",
			"sensitivity",
			"invertScroll",
		] as const

		const filtered: Record<string, unknown> = {}

		for (const key of SERVER_CONFIG_KEYS) {
			if (!(key in body)) continue

			if (key === "frontendPort") {
				const port = Number(body[key])
				if (
					!Number.isFinite(port) ||
					port < 1 ||
					port > 65535 ||
					Math.floor(port) !== port
				) {
					json(res, 400, { error: "Invalid port number (must be 1–65535)" })
					return
				}
				filtered[key] = port
			} else if (key === "inputThrottleMs") {
				const ms = Number(body[key])
				if (!Number.isFinite(ms) || ms < 1 || ms > 1000) {
					json(res, 400, { error: "Invalid inputThrottleMs (must be 1–1000)" })
					return
				}
				filtered[key] = ms
			} else if (key === "sensitivity") {
				const sens = Number(body[key])
				if (!Number.isFinite(sens) || sens < 0.1 || sens > 10.0) {
					json(res, 400, { error: "Invalid sensitivity (must be 0.1–10.0)" })
					return
				}
				filtered[key] = sens
			} else if (key === "invertScroll") {
				if (typeof body[key] !== "boolean") {
					json(res, 400, { error: "invertScroll must be a boolean" })
					return
				}
				filtered[key] = body[key]
			} else if (
				typeof body[key] === "string" &&
				(body[key] as string).length <= 255
			) {
				filtered[key] = body[key]
			}
		}

		if (Object.keys(filtered).length === 0) {
			json(res, 400, { error: "No valid config keys provided" })
			return
		}

		// Buffer config changes to prevent Vite server restart
		setPendingConfigUpdates({ ...(pendingConfigUpdates || {}), ...filtered })
		logger.info(
			"Configuration updates cached. Changes will be written to server-config.json when Vite/server exits.",
		)

		// Immediately propagate configuration changes to all active input connections
		const inputConfigUpdate: Partial<InputConfig> = {}
		if (typeof filtered.sensitivity === "number") {
			inputConfigUpdate.sensitivity = filtered.sensitivity
		}
		if (typeof filtered.invertScroll === "boolean") {
			inputConfigUpdate.invertScroll = filtered.invertScroll
		}

		if (Object.keys(inputConfigUpdate).length > 0) {
			for (const inputPc of inputConnections.values()) {
				inputPc.updateConfig(inputConfigUpdate)
			}
		}

		const current = fs.existsSync(configPath)
			? (JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
					string,
					unknown
				>)
			: {}
		const newConfig = { ...current, ...filtered }
		json(res, 200, { ok: true, config: newConfig })
	} catch (err) {
		logger.error(`Failed to update config: ${String(err)}`)
		json(res, 500, { error: String(err) })
	}
}

export async function handleWhipSignalingExchange(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const sessionId = url.searchParams.get("sessionId")

	if (!sessionId) {
		json(res, 400, { error: "sessionId parameter context missing" })
		return
	}

	let token = url.searchParams.get("token")
	if (!token) {
		const authHeader = req.headers.authorization ?? ""
		if (authHeader.startsWith("Bearer ")) {
			token = authHeader.slice(7).trim()
		} else if (authHeader.startsWith("Bearer_")) {
			token = authHeader.slice(7).trim()
		}
	}

	if (!token || !isKnownToken(token)) {
		json(res, 401, { error: "Unauthorized" })
		return
	}

	const hostOfferSdp = await readBody(req)
	logger.info(`WHIP offer received for session: ${sessionId}`)

	const session = sessions.get(sessionId)
	if (!session) {
		json(res, 404, { error: "Target session context not found" })
		return
	}

	session.offer = hostOfferSdp
	session.state = "offering"

	pushEvent(sessionId, "offer", { sessionId, sdp: hostOfferSdp })

	let checkCount = 0
	const answerCheckInterval = setInterval(() => {
		const activeSession = sessions.get(sessionId)
		checkCount++

		if (activeSession?.answer) {
			clearInterval(answerCheckInterval)
			res.writeHead(201, {
				"Content-Type": "application/sdp",
				Location: `/api/webrtc/whip?sessionId=${sessionId}`,
			})
			res.end(activeSession.answer)
			logger.info(`WHIP handshake complete for session: ${sessionId}`)
		} else if (
			checkCount >= 50 ||
			!activeSession ||
			activeSession.state === "closed"
		) {
			clearInterval(answerCheckInterval)
			res.writeHead(408, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ error: "WHIP signaling handshake timeout" }))
		}
	}, 100)
	req.on("close", () => clearInterval(answerCheckInterval))
}
