import {
	MediaStreamTrack,
	RTCPeerConnection,
	RTCRtpCodecParameters,
	type RTCDataChannel,
} from "werift"
import crypto from "node:crypto"
import type { ServerResponse } from "node:http"
import { InputHandler } from "../InputHandler.ts"
import logger from "../../utils/logger.ts"
import type { InputMessage, InputConfig } from "../types.ts"
import { isKnownToken } from "../tokenStore.ts"
import { ICE_PORT_MAX, ICE_PORT_MIN } from "../constants.ts"
import { loadServerConfig } from "../../utils/configHelper.ts"
import { isLoopbackAddress } from "../../utils/net.ts"
import { UdpSocketManager } from "./handlers/udpSocket.ts"
import {
	type ClientSession,
	type SessionSseEvent,
	type SessionSnapshot,
	pushSessionEvent,
	attachSessionSse,
	cleanupSession,
	snapshotSessions,
} from "./handlers/sessionStore.ts"

function isAuthorized(
	remoteAddress: string | undefined,
	authHeader: string | undefined,
	queryToken: string | null,
): boolean {
	if (isLoopbackAddress(remoteAddress)) return true
	const bearer = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: null
	const token = bearer ?? queryToken
	return token !== null && isKnownToken(token)
}
export type { SessionSnapshot }

export class WebRTCManager {
	private readonly clients = new Map<string, ClientSession>()
	private readonly udp: UdpSocketManager

	constructor() {
		this.udp = new UdpSocketManager(this.clients)
	}

	public hasError(): boolean {
		return !this.udp.healthy()
	}

	// -------------------------------------------------------------------------
	// POST /api/rtc/offer
	public async handleOffer(
		remoteAddress: string | undefined,
		authHeader: string | undefined,
		queryToken: string | null,
	): Promise<
		| { ok: true; sessionId: string; offer: RTCSessionDescriptionInit }
		| { ok: false; status: number; error: string }
	> {
		if (!isAuthorized(remoteAddress, authHeader, queryToken)) {
			return { ok: false, status: 401, error: "Unauthorized" }
		}

		const sessionId = crypto.randomUUID()

		const pc = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			icePortRange: [ICE_PORT_MIN, ICE_PORT_MAX],
			codecs: {
				video: [
					new RTCRtpCodecParameters({
						mimeType: "video/H264",
						clockRate: 90000,
						payloadType: 96,
						rtcpFeedback: [
							{ type: "nack" },
							{ type: "nack", parameter: "pli" },
							{ type: "goog-remb" },
						],
					}),
				],
				audio: [
					new RTCRtpCodecParameters({
						mimeType: "audio/opus",
						clockRate: 48000,
						channels: 2,
						payloadType: 111,
					}),
				],
			},
		})

		const videoTrack = new MediaStreamTrack({ kind: "video" })
		pc.addTrack(videoTrack)

		const audioTrack = new MediaStreamTrack({ kind: "audio" })
		pc.addTrack(audioTrack)

		// Errors that fire synchronously during InputHandler construction arrive
		// before this session exists in this.clients, so pushSessionEvent would
		// drop them. Buffer them here and flush into pendingEvents after the
		// session is registered.
		const preInitErrors: SessionSseEvent[] = []

		const inputHandler = new InputHandler(
			this.loadConfig(),
			8,
			(errorType, message) => {
				logger.error(
					`InputHandler error [${sessionId}]: ${errorType} – ${message}`,
				)
				// If the session is already registered, push directly; otherwise
				// buffer so it's not lost before clients.set() is called below.
				if (this.clients.has(sessionId)) {
					pushSessionEvent(this.clients, sessionId, {
						type: "error",
						errorType,
						message,
					})
				} else {
					preInitErrors.push({ type: "error", errorType, message })
				}
			},
		)

		// input-unordered: motion/scroll/zoom : maxRetransmits:0 prevents HOL blocking
		const dcUnordered = pc.createDataChannel("input-unordered", {
			ordered: false,
			maxRetransmits: 0,
		})
		// input-ordered: keyboard/click
		const dcOrdered = pc.createDataChannel("input-ordered", { ordered: true })

		const handleDataMessage = (dc: RTCDataChannel, msg: Buffer | string) => {
			try {
				const raw = typeof msg === "string" ? msg : msg.toString()
				const session = this.clients.get(sessionId)
				if (session) session.bytesRecv += raw.length
				const parsed = JSON.parse(raw)
				if (parsed.type === "ping") {
					const pong = JSON.stringify({
						type: "pong",
						timestamp: parsed.timestamp,
					})
					if (dc.readyState === "open") dc.send(pong)
					return
				}
				inputHandler.handleMessage(parsed as InputMessage).catch((err) => {
					logger.error(`Input handler error [${sessionId}]: ${String(err)}`)
				})
			} catch (err) {
				logger.error(`Input parse error [${sessionId}]: ${String(err)}`)
			}
		}

		dcUnordered.onMessage.subscribe((msg) =>
			handleDataMessage(dcUnordered, msg),
		)
		dcOrdered.onMessage.subscribe((msg) => handleDataMessage(dcOrdered, msg))

		const session: ClientSession = {
			pc,
			videoTrack,
			audioTrack,
			inputHandler,
			sessionId,
			bytesRecv: 0,
			bytesSent: 0,
			dcUnordered,
			dcOrdered,
			sessionSseRes: null,
			pendingEvents: [],
			createdAt: Date.now(),
		}
		this.clients.set(sessionId, session)

		// Flush errors that fired before the session was registered
		for (const ev of preInitErrors) {
			session.pendingEvents.push(ev)
		}

		pc.onIceCandidate.subscribe((candidate) => {
			if (!candidate) return
			pushSessionEvent(this.clients, sessionId, {
				type: "ice",
				candidate: candidate.toJSON() as RTCIceCandidateInit,
			})
		})

		pc.iceConnectionStateChange.subscribe((state) => {
			logger.info(`ICE state [${sessionId}]: ${state}`)
			if (state === "failed" || state === "closed") {
				cleanupSession(this.clients, sessionId)
			}
		})

		try {
			const offer = await pc.createOffer()
			await pc.setLocalDescription(offer)
			logger.info(`Session created, offer sent: ${sessionId}`)
			return { ok: true, sessionId, offer: offer as RTCSessionDescriptionInit }
		} catch (err) {
			logger.error(`Failed to create offer [${sessionId}]: ${String(err)}`)
			cleanupSession(this.clients, sessionId)
			return { ok: false, status: 500, error: "Failed to create WebRTC offer" }
		}
	}

	// -------------------------------------------------------------------------
	// POST /api/rtc/answer
	public async handleAnswer(
		remoteAddress: string | undefined,
		authHeader: string | undefined,
		queryToken: string | null,
		sessionId: string,
		sdp: RTCSessionDescriptionInit,
	): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
		if (!isAuthorized(remoteAddress, authHeader, queryToken)) {
			return { ok: false, status: 401, error: "Unauthorized" }
		}
		const session = this.clients.get(sessionId)
		if (!session) return { ok: false, status: 404, error: "Session not found" }

		try {
			await session.pc.setRemoteDescription(sdp)
			logger.info(`Answer applied for session: ${sessionId}`)
			return { ok: true }
		} catch (err) {
			logger.error(`Failed to apply answer [${sessionId}]: ${String(err)}`)
			return { ok: false, status: 400, error: "Failed to apply SDP answer" }
		}
	}

	// -------------------------------------------------------------------------
	// POST /api/rtc/ice
	public async handleIceCandidate(
		remoteAddress: string | undefined,
		authHeader: string | undefined,
		queryToken: string | null,
		sessionId: string,
		candidate: RTCIceCandidateInit,
	): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
		if (!isAuthorized(remoteAddress, authHeader, queryToken)) {
			return { ok: false, status: 401, error: "Unauthorized" }
		}
		const session = this.clients.get(sessionId)
		if (!session) return { ok: false, status: 404, error: "Session not found" }

		try {
			await session.pc.addIceCandidate(candidate)
			return { ok: true }
		} catch (err) {
			logger.error(`Failed to add ICE candidate [${sessionId}]: ${String(err)}`)
			return { ok: false, status: 400, error: "Failed to add ICE candidate" }
		}
	}

	// -------------------------------------------------------------------------
	// GET /api/rtc/session-sse
	public handleSessionSse(
		remoteAddress: string | undefined,
		authHeader: string | undefined,
		queryToken: string | null,
		sessionId: string,
		res: ServerResponse,
	): boolean {
		if (!isAuthorized(remoteAddress, authHeader, queryToken)) return false
		const session = this.clients.get(sessionId)
		if (!session) return false
		attachSessionSse(session, res)
		return true
	}

	// -------------------------------------------------------------------------
	// DELETE /api/rtc/session
	public handleDisconnect(
		remoteAddress: string | undefined,
		authHeader: string | undefined,
		queryToken: string | null,
		sessionId: string,
	): { ok: true } | { ok: false; status: number; error: string } {
		if (!isAuthorized(remoteAddress, authHeader, queryToken)) {
			return { ok: false, status: 401, error: "Unauthorized" }
		}
		if (!this.clients.has(sessionId)) {
			return { ok: false, status: 404, error: "Session not found" }
		}
		cleanupSession(this.clients, sessionId)
		logger.info(`Session cleanly disconnected: ${sessionId}`)
		return { ok: true }
	}

	// -------------------------------------------------------------------------
	// Public utilities
	public getSessions(): SessionSnapshot[] {
		return snapshotSessions(this.clients)
	}

	public updateConfig(config: Partial<InputConfig>) {
		for (const client of this.clients.values()) {
			client.inputHandler.updateConfig(config)
		}
	}

	public async shutdown(): Promise<void> {
		await this.udp.shutdown()
		for (const sessionId of [...this.clients.keys()]) {
			cleanupSession(this.clients, sessionId)
		}
	}

	public async recreateUdpSockets(): Promise<void> {
		await this.udp.recreateSockets()
	}

	// Private helpers
	private loadConfig(): Partial<InputConfig> {
		try {
			const cfg = loadServerConfig()
			return {
				sensitivity:
					typeof cfg.sensitivity === "number" ? cfg.sensitivity : 1.0,
				invertScroll:
					typeof cfg.invertScroll === "boolean" ? cfg.invertScroll : false,
			}
		} catch (e) {
			logger.warn(
				`Failed to read initial config from server-config.json: ${String(e)}`,
			)
		}
		return { sensitivity: 1.0, invertScroll: false }
	}
}
