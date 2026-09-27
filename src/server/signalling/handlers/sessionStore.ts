import type { MediaStreamTrack, RTCDataChannel } from "werift"
import type { RTCPeerConnection } from "werift"
import type { ServerResponse } from "node:http"
import type { InputHandler } from "../../InputHandler.ts"
import logger from "../../../utils/logger.ts"

export type SessionSseEvent =
	| { type: "ice"; candidate: RTCIceCandidateInit }
	| { type: "error"; errorType: string; message: string }

export interface ClientSession {
	pc: RTCPeerConnection
	videoTrack: MediaStreamTrack
	audioTrack: MediaStreamTrack
	inputHandler: InputHandler
	sessionId: string
	bytesRecv: number
	bytesSent: number
	dcUnordered: RTCDataChannel
	dcOrdered: RTCDataChannel
	sessionSseRes: ServerResponse | null
	pendingEvents: SessionSseEvent[]
	disconnectTimer?: ReturnType<typeof setTimeout> | null
	createdAt: number
}

export interface SessionSnapshot {
	id: string
	state: string
	createdAt: number
	/** True when the client's session SSE stream is currently connected. */
	hasSseConnection: boolean
	hasInputConnection: boolean
	bytesRecv: number
	bytesSent: number
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

/**
 * Pushes a typed event onto a session's SSE stream.
 * If the stream is not yet open the event is buffered and flushed on connect.
 */
export function pushSessionEvent(
	clients: Map<string, ClientSession>,
	sessionId: string,
	event: SessionSseEvent,
): void {
	const s = clients.get(sessionId)
	if (!s) return
	const payload = `data: ${JSON.stringify(event)}\n\n`
	if (s.sessionSseRes && !s.sessionSseRes.writableEnded) {
		try {
			s.sessionSseRes.write(payload)
			return
		} catch {
			s.sessionSseRes = null
		}
	}
	// SSE not yet open — buffer the event
	s.pendingEvents.push(event)
}

/**
 * Attaches an SSE response to a session, flushes any buffered events, and
 * installs a keep-alive timer.  Returns false if the session is unknown.
 */
export function attachSessionSse(
	session: ClientSession,
	res: ServerResponse,
): void {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	})
	res.write(": connected\n\n")

	// Flush events that arrived before the SSE connection opened
	for (const event of session.pendingEvents) {
		try {
			res.write(`data: ${JSON.stringify(event)}\n\n`)
		} catch {
			break
		}
	}
	session.pendingEvents = []
	session.sessionSseRes = res

	const keepAliveTimer = setInterval(() => {
		try {
			res.write(": keep-alive\n\n")
		} catch {
			clearInterval(keepAliveTimer)
			if (session.sessionSseRes === res) session.sessionSseRes = null
		}
	}, 15_000)

	const cleanup = () => {
		clearInterval(keepAliveTimer)
		if (session.sessionSseRes === res) session.sessionSseRes = null
	}
	res.on("close", cleanup)
	res.on("error", cleanup)
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export function cleanupSession(
	clients: Map<string, ClientSession>,
	sessionId: string,
): void {
	const client = clients.get(sessionId)
	if (!client) return
	logger.info(`Cleaning up session: ${sessionId}`)
	if (client.disconnectTimer) {
		clearTimeout(client.disconnectTimer)
		client.disconnectTimer = null
	}
	try {
		client.pc.close()
	} catch {}
	try {
		client.inputHandler.destroy()
	} catch {}
	try {
		if (client.sessionSseRes && !client.sessionSseRes.writableEnded) {
			client.sessionSseRes.end()
		}
	} catch {}
	clients.delete(sessionId)
}

export function snapshotSessions(
	clients: Map<string, ClientSession>,
): SessionSnapshot[] {
	const snapshots: SessionSnapshot[] = []
	for (const [id, client] of clients) {
		snapshots.push({
			id,
			state: client.pc.iceConnectionState ?? "new",
			createdAt: client.createdAt,
			hasSseConnection:
				client.sessionSseRes !== null && !client.sessionSseRes.writableEnded,
			hasInputConnection:
				client.dcUnordered.readyState === "open" ||
				client.dcOrdered.readyState === "open",
			bytesRecv: client.bytesRecv,
			bytesSent: client.bytesSent,
		})
	}
	return snapshots
}
