import type { IncomingMessage, ServerResponse } from "node:http"
import type { WebRTCManager } from "../webRTC.ts"
import logger from "../../../utils/logger.ts"
import { parseJsonBody, json } from "../utils.ts"

export interface RtcHandlerDeps {
	webrtcManager: WebRTCManager | null
}

export function handleOffer(
	req: IncomingMessage,
	res: ServerResponse,
	deps: RtcHandlerDeps,
): void {
	if (!deps.webrtcManager) {
		json(res, 503, { error: "WebRTC engine not ready" })
		return
	}
	const url = new URL(
		req.url ?? "",
		`http://${req.headers.host ?? "localhost"}`,
	)
	const remoteAddr = req.socket.remoteAddress
	const authHeader = req.headers.authorization
	const queryToken = url.searchParams.get("token")

	deps.webrtcManager
		.handleOffer(remoteAddr, authHeader, queryToken)
		.then((result) => {
			if (!result.ok) {
				json(res, result.status, { error: result.error })
			} else {
				json(res, 200, {
					sessionId: result.sessionId,
					offer: result.offer,
				})
			}
		})
		.catch((err) => {
			logger.error(`/api/rtc/offer error: ${String(err)}`)
			json(res, 500, { error: "Internal server error" })
		})
}

export function handleAnswer(
	req: IncomingMessage,
	res: ServerResponse,
	deps: RtcHandlerDeps,
): void {
	if (!deps.webrtcManager) {
		json(res, 503, { error: "WebRTC engine not ready" })
		return
	}
	const url = new URL(
		req.url ?? "",
		`http://${req.headers.host ?? "localhost"}`,
	)
	const remoteAddr = req.socket.remoteAddress
	const authHeader = req.headers.authorization
	const queryToken = url.searchParams.get("token")
	const wm = deps.webrtcManager

	parseJsonBody<{ sessionId?: string; sdp?: RTCSessionDescriptionInit }>(req)
		.then(async (body) => {
			if (!body.sessionId || !body.sdp) {
				json(res, 400, { error: "Missing sessionId or sdp" })
				return
			}
			const result = await wm.handleAnswer(
				remoteAddr,
				authHeader,
				queryToken,
				body.sessionId,
				body.sdp,
			)
			if (!result) {
				json(res, 503, { error: "WebRTC engine not ready" })
			} else if (!result.ok) {
				json(res, result.status, { error: result.error })
			} else {
				json(res, 200, { ok: true })
			}
		})
		.catch((err) => {
			logger.error(`/api/rtc/answer error: ${String(err)}`)
			json(res, 400, { error: "Invalid request body" })
		})
}

export function handleIce(
	req: IncomingMessage,
	res: ServerResponse,
	deps: RtcHandlerDeps,
): void {
	if (!deps.webrtcManager) {
		json(res, 503, { error: "WebRTC engine not ready" })
		return
	}
	const url = new URL(
		req.url ?? "",
		`http://${req.headers.host ?? "localhost"}`,
	)
	const remoteAddr = req.socket.remoteAddress
	const authHeader = req.headers.authorization
	const queryToken = url.searchParams.get("token")
	const wm = deps.webrtcManager

	parseJsonBody<{ sessionId?: string; candidate?: RTCIceCandidateInit }>(req)
		.then(async (body) => {
			if (!body.sessionId || !body.candidate) {
				json(res, 400, { error: "Missing sessionId or candidate" })
				return
			}
			const result = await wm.handleIceCandidate(
				remoteAddr,
				authHeader,
				queryToken,
				body.sessionId,
				body.candidate,
			)
			if (!result) {
				json(res, 503, { error: "WebRTC engine not ready" })
			} else if (!result.ok) {
				json(res, result.status, { error: result.error })
			} else {
				json(res, 200, { ok: true })
			}
		})
		.catch((err) => {
			logger.error(`/api/rtc/ice (POST) error: ${String(err)}`)
			json(res, 400, { error: "Invalid request body" })
		})
}

export function handleSessionSSE(
	req: IncomingMessage,
	res: ServerResponse,
	deps: RtcHandlerDeps,
): void {
	if (!deps.webrtcManager) {
		json(res, 503, { error: "WebRTC engine not ready" })
		return
	}
	const url = parseAddress(req, res)
	if (url === undefined) return
	const accepted = deps.webrtcManager.handleSessionSse(
		url.remoteAddr,
		url.authHeader,
		url.queryToken,
		url.sessionId,
		res,
	)
	if (!accepted) {
		json(res, 401, { error: "Unauthorized or session not found" })
	}
	// Response kept open as SSE — do NOT call json() here
}

export function handleSessionDelete(
	req: IncomingMessage,
	res: ServerResponse,
	deps: RtcHandlerDeps,
): void {
	if (!deps.webrtcManager) {
		json(res, 503, { error: "WebRTC engine not ready" })
		return
	}
	// sessionId comes from the request body, not the URL — parse auth fields inline
	const { remoteAddr, authHeader, queryToken } = parseRequestMeta(req)
	const wm = deps.webrtcManager

	parseJsonBody<{ sessionId?: string }>(req)
		.then((body) => {
			if (!body.sessionId) {
				json(res, 400, { error: "Missing sessionId" })
				return
			}
			const result = wm.handleDisconnect(
				remoteAddr,
				authHeader,
				queryToken,
				body.sessionId,
			)
			if (!result) {
				json(res, 503, { error: "WebRTC engine not ready" })
			} else if (!result.ok) {
				json(res, result.status, { error: result.error })
			} else {
				json(res, 200, { ok: true })
			}
		})
		.catch((err) => {
			logger.error(`/api/rtc/session DELETE error: ${String(err)}`)
			json(res, 400, { error: "Invalid request body" })
		})
}

/** Extracts auth fields from a request — no sessionId guard (use parseAddress for SSE). */
function parseRequestMeta(req: IncomingMessage) {
	const url = new URL(
		req.url ?? "",
		`http://${req.headers.host ?? "localhost"}`,
	)
	return {
		remoteAddr: req.socket.remoteAddress,
		authHeader: req.headers.authorization,
		queryToken: url.searchParams.get("token"),
	}
}

/**
 * Extracts auth fields + sessionId from the URL query string.
 * Writes a 400 and returns undefined when sessionId is absent.
 */
function parseAddress(
	req: IncomingMessage,
	res: ServerResponse,
):
	| {
			remoteAddr: string | undefined
			authHeader: string | undefined
			queryToken: string | null
			sessionId: string
	  }
	| undefined {
	const url = new URL(
		req.url ?? "",
		`http://${req.headers.host ?? "localhost"}`,
	)
	const sessionId = url.searchParams.get("sessionId")
	if (!sessionId) {
		json(res, 400, { error: "Missing sessionId" })
		return undefined
	}
	return {
		remoteAddr: req.socket.remoteAddress,
		authHeader: req.headers.authorization,
		queryToken: url.searchParams.get("token"),
		sessionId,
	}
}
