/**
 * webrtc-signal.ts
 *
 * WebRTC signalling endpoint for Issue #208.
 * Handles SDP offer/answer exchange and ICE candidate trickle for LAN WebRTC.
 *
 * This is a TanStack Start API route — it reuses the existing HTTP server
 * with no extra port or external signalling service required.
 *
 * Protocol:
 *   POST /api/webrtc-signal   { type: "offer", sessionId, payload: SDP }
 *     → stores offer, waits for viewer answer, returns { answer: SDP }
 *
 *   POST /api/webrtc-signal   { type: "answer", sessionId, payload: SDP }
 *     → stores answer for the waiting offer handler
 *
 *   POST /api/webrtc-signal   { type: "ice-candidate", sessionId, payload: ICE }
 *     → stores candidate; viewer polls or long-polls to pick up
 *
 *   POST /api/webrtc-signal   { type: "bye", sessionId, payload: null }
 *     → cleans up session state
 *
 * Full GSoC implementation will add:
 * - Long-poll or Server-Sent Events for ICE candidate delivery to viewer
 * - Session timeout / garbage collection
 * - Auth token validation before accepting offers
 */

import { createAPIFileRoute } from "@tanstack/start/api"

interface SessionState {
	offer?: RTCSessionDescriptionInit
	answer?: RTCSessionDescriptionInit
	iceCandidates: RTCIceCandidateInit[]
	answerResolvers: Array<(answer: RTCSessionDescriptionInit) => void>
	createdAt: number
}

// In-memory store — sufficient for single-user LAN use case
const sessions = new Map<string, SessionState>()

const SESSION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function getOrCreateSession(id: string): SessionState {
	let s = sessions.get(id)
	if (!s) {
		s = { iceCandidates: [], answerResolvers: [], createdAt: Date.now() }
		sessions.set(id, s)
		// Auto-cleanup after timeout
		setTimeout(() => sessions.delete(id), SESSION_TIMEOUT_MS)
	}
	return s
}

function waitForAnswer(
	session: SessionState,
	timeoutMs = 10_000,
): Promise<RTCSessionDescriptionInit> {
	return new Promise((resolve, reject) => {
		if (session.answer) return resolve(session.answer)
		const timer = setTimeout(
			() => reject(new Error("Timeout waiting for WebRTC answer")),
			timeoutMs,
		)
		session.answerResolvers.push((answer) => {
			clearTimeout(timer)
			resolve(answer)
		})
	})
}

export const APIRoute = createAPIFileRoute("/api/webrtc-signal")({
	POST: async ({ request }) => {
		const { type, sessionId, payload } = (await request.json()) as {
			type: "offer" | "answer" | "ice-candidate" | "bye"
			sessionId: string
			payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null
		}

		if (!sessionId || typeof sessionId !== "string") {
			return Response.json({ error: "sessionId required" }, { status: 400 })
		}

		const session = getOrCreateSession(sessionId)

		switch (type) {
			case "offer": {
				session.offer = payload as RTCSessionDescriptionInit
				try {
					const answer = await waitForAnswer(session)
					return Response.json({ type: "answer", payload: answer })
				} catch {
					return Response.json(
						{ error: "No answer received in time" },
						{ status: 504 },
					)
				}
			}

			case "answer": {
				session.answer = payload as RTCSessionDescriptionInit
				// Wake up any waiting offer handlers
				for (const resolve of session.answerResolvers) {
					resolve(session.answer)
				}
				session.answerResolvers = []
				return Response.json({ ok: true })
			}

			case "ice-candidate": {
				if (payload) {
					session.iceCandidates.push(payload as RTCIceCandidateInit)
				}
				return Response.json({ ok: true })
			}

			case "bye": {
				sessions.delete(sessionId)
				return Response.json({ ok: true })
			}

			default:
				return Response.json({ error: "Unknown signal type" }, { status: 400 })
		}
	},

	// Viewer polls for ICE candidates
	GET: async ({ request }) => {
		const url = new URL(request.url)
		const sessionId = url.searchParams.get("sessionId")
		if (!sessionId)
			return Response.json({ error: "sessionId required" }, { status: 400 })

		const session = sessions.get(sessionId)
		if (!session) return Response.json({ candidates: [], offer: null })

		return Response.json({
			offer: session.offer ?? null,
			candidates: session.iceCandidates,
		})
	},
})
