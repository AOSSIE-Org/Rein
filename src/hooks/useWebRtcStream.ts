"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"
import { t } from "../utils/i18n"

interface UseWebRtcStreamOptions {
	token: string | null
}

const MAX_RETRIES = 5

// ---------------------------------------------------------------------------
// Signaling helpers
// ---------------------------------------------------------------------------

/** POST helper that attaches the Bearer token and parses JSON response. */
async function signalingPost<T>(
	path: string,
	token: string,
	body: unknown,
): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	})
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }))
		throw new Error(
			`[Signaling] ${path} failed (${res.status}): ${(err as { error?: string }).error ?? res.statusText}`,
		)
	}
	return res.json() as Promise<T>
}

/** DELETE helper for session teardown. */
async function signalingDelete(path: string, token: string, body: unknown) {
	await fetch(path, {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	}).catch(() => {
		/* best-effort teardown */
	})
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebRtcStream({ token }: UseWebRtcStreamOptions) {
	const [trackActive, setTrackActive] = useState(false)
	const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [errorHandle, setErrorHandle] = useState<string | null>(null)
	const [connecting, setConnecting] = useState(false)
	const [reconnectAttempt, setReconnectAttempt] = useState(0)
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

	const { registerDataChannel, send: sendInputEvent } = useConnection()

	const pcRef = useRef<RTCPeerConnection | null>(null)
	const sessionIdRef = useRef<string | null>(null)
	const iceSseRef = useRef<EventSource | null>(null)
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const trackActiveRef = useRef(false)
	const retryCountRef = useRef(0)
	const isRetryingRef = useRef(false)

	useEffect(() => {
		trackActiveRef.current = trackActive
	}, [trackActive])

	useEffect(() => {
		return () => {
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
		}
	}, [])

	// -------------------------------------------------------------------------
	// Retry / reconnect
	// -------------------------------------------------------------------------

	const cleanup = useCallback(() => {
		if (iceSseRef.current) {
			iceSseRef.current.close()
			iceSseRef.current = null
		}
		if (pcRef.current) {
			try {
				pcRef.current.onconnectionstatechange = null
				pcRef.current.ontrack = null
				pcRef.current.ondatachannel = null
				pcRef.current.onicecandidate = null
				pcRef.current.close()
			} catch {}
			pcRef.current = null
		}
	}, [])

	const triggerRetry = useCallback(() => {
		if (retryTimerRef.current || isRetryingRef.current) return
		isRetryingRef.current = true

		if (retryCountRef.current >= MAX_RETRIES) {
			console.warn(
				`[WebRTC] Max retry attempts (${MAX_RETRIES}) reached. Stopping retries.`,
			)
			setConnecting(false)
			setErrorHandle(t("errorComponent", "connectionFailedTitle"))
			setError(t("errorComponent", "connectionFailedBody"))
			return
		}

		cleanup()
		setTrackActive(false)
		setVideoStream(null)

		const backoffDelay = Math.min(2000 * 2 ** retryCountRef.current, 30_000)
		console.log(
			`[WebRTC] Transient failure – retrying (attempt ${retryCountRef.current + 1}/${MAX_RETRIES}) in ${backoffDelay / 1000}s…`,
		)
		retryTimerRef.current = setTimeout(() => {
			retryTimerRef.current = null
			isRetryingRef.current = false
			retryCountRef.current += 1
			setReconnectAttempt((prev) => prev + 1)
		}, backoffDelay)
	}, [cleanup])

	const handleNetworkFailure = useCallback(() => {
		triggerRetry()
	}, [triggerRetry])

	const reconnect = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current)
			retryTimerRef.current = null
		}
		isRetryingRef.current = false
		cleanup()
		setErrorHandle(null)
		setError(null)
		setConnecting(true)
		setTrackActive(false)
		setVideoStream(null)
		setActiveSessionId(null)
		retryCountRef.current = 0
		setReconnectAttempt((prev) => prev + 1)
	}, [cleanup])

	// -------------------------------------------------------------------------
	// Main signaling effect
	// -------------------------------------------------------------------------

	useEffect(() => {
		if (!token) return

		let isDisposed = false

		setConnecting(true)

		if (reconnectAttempt > 0) {
			console.log(
				`[WebRTC] Re-establishing session (attempt ${reconnectAttempt})…`,
			)
		}

		const pc = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			bundlePolicy: "max-bundle",
		})
		pcRef.current = pc

		let dcUnordered: RTCDataChannel | null = null
		let dcOrdered: RTCDataChannel | null = null

		// ICE candidates generated locally that arrived before we had a sessionId
		const localIceQueue: RTCIceCandidateInit[] = []
		// ICE candidates from the server buffered before remoteDescription is set
		const remoteIceQueue: RTCIceCandidateInit[] = []

		let sessionId: string | null = null

		// -------------------------------------------------------------------
		// 1. Track and data-channel handlers
		// -------------------------------------------------------------------

		let activeStream: MediaStream | null = null
		pc.ontrack = (event) => {
			if (isDisposed || isRetryingRef.current) return
			console.log(`[WebRTC] Received track: ${event.track.kind}`)

			if (!activeStream) {
				activeStream = event.streams[0] || new MediaStream()
				setVideoStream(activeStream)
			}

			if (!activeStream.getTracks().some((t) => t.id === event.track.id)) {
				activeStream.addTrack(event.track)
				// Create a new stream copy to trigger React dependency update
				setVideoStream(new MediaStream(activeStream.getTracks()))
			}

			if (event.track.kind === "video") {
				setTrackActive(true)
				setConnecting(false)
				retryCountRef.current = 0
			}
		}

		pc.ondatachannel = (event) => {
			if (isDisposed || isRetryingRef.current) return
			const channel = event.channel
			if (channel.label === "input-unordered") {
				dcUnordered = channel
			} else if (channel.label === "input-ordered") {
				dcOrdered = channel
			}
			if (dcUnordered && dcOrdered) {
				registerDataChannel(dcUnordered, dcOrdered)
			}
		}

		pc.onconnectionstatechange = () => {
			if (isDisposed || isRetryingRef.current) return
			if (
				pc.connectionState === "failed" ||
				pc.connectionState === "disconnected"
			) {
				handleNetworkFailure()
			}
		}

		// -------------------------------------------------------------------
		// 2. Local ICE candidates → POST /api/rtc/ice
		// -------------------------------------------------------------------

		pc.onicecandidate = (event) => {
			if (isDisposed || isRetryingRef.current || !event.candidate) return
			const init = event.candidate.toJSON()
			if (!sessionId) {
				// Buffer until we receive the sessionId from the offer response
				localIceQueue.push(init)
				return
			}
			signalingPost("/api/rtc/ice", token, {
				sessionId,
				candidate: init,
			}).catch((err) => {
				if (!isDisposed && !isRetryingRef.current) {
					console.error("[WebRTC] Failed to send local ICE candidate:", err)
					handleNetworkFailure()
				}
			})
		}

		// -------------------------------------------------------------------
		// 3. Drain a queue of remote ICE candidates into the peer connection
		// -------------------------------------------------------------------

		const drainRemoteIceQueue = async () => {
			while (remoteIceQueue.length > 0) {
				const cand = remoteIceQueue.shift()
				if (cand) {
					await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {})
				}
			}
		}

		// -------------------------------------------------------------------
		// 4. Open session SSE stream: receives server ICE candidates + errors
		// -------------------------------------------------------------------

		const openSessionSse = (sid: string) => {
			const sseUrl = `/api/rtc/session-sse?sessionId=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`
			const es = new EventSource(sseUrl)
			iceSseRef.current = es

			es.onmessage = async (event) => {
				if (isDisposed || isRetryingRef.current) return
				try {
					const msg = JSON.parse(event.data) as {
						type: string
						candidate?: RTCIceCandidateInit
						errorType?: string
						message?: string
					}
					if (msg.type === "ice" && msg.candidate) {
						// Server ICE candidate — add immediately or buffer if not ready
						if (pc.remoteDescription) {
							await pc
								.addIceCandidate(new RTCIceCandidate(msg.candidate))
								.catch(() => {})
						} else {
							remoteIceQueue.push(msg.candidate)
						}
					} else if (msg.type === "error") {
						// InputHandler error from the server — surface it in ErrorComponent
						console.error("[WebRTC] Server InputHandler error:", msg)
						setConnecting(false)
						setErrorHandle(msg.errorType ?? "Host Error")
						setError(msg.message ?? "The host reported an input error")
					}
				} catch (err) {
					console.error("[WebRTC] Session SSE parse error:", err)
				}
			}

			es.onerror = () => {
				if (!isDisposed && !isRetryingRef.current) {
					console.warn(
						"[WebRTC] Session SSE stream error – retrying connection",
					)
					handleNetworkFailure()
				}
			}
		}

		// -------------------------------------------------------------------
		// 5. Kick off the handshake:
		//    POST /api/rtc/offer  →  open ICE SSE  →  POST /api/rtc/answer
		// -------------------------------------------------------------------
		;(async () => {
			try {
				// Step 1: request an offer from the server
				const { sessionId: sid, offer } = await signalingPost<{
					sessionId: string
					offer: RTCSessionDescriptionInit
				}>("/api/rtc/offer", token, {})

				if (isDisposed || isRetryingRef.current) return

				sessionId = sid
				sessionIdRef.current = sid
				setActiveSessionId(sid)

				// Step 2: open the session SSE channel (ICE + errors)
				openSessionSse(sid)

				// Step 3: apply the offer and create an answer
				await pc.setRemoteDescription(offer)

				// Drain any remote ICE candidates that arrived before the offer
				await drainRemoteIceQueue()

				const answer = await pc.createAnswer()
				await pc.setLocalDescription(answer)

				// Step 4: send the answer
				await signalingPost("/api/rtc/answer", token, {
					sessionId: sid,
					sdp: answer,
				})

				if (isDisposed || isRetryingRef.current) return

				// Step 5: flush any local ICE candidates that arrived before sessionId
				for (const candidate of localIceQueue.splice(0)) {
					signalingPost("/api/rtc/ice", token, {
						sessionId: sid,
						candidate,
					}).catch(console.error)
				}

				console.log(`[WebRTC] Handshake complete – session ${sid}`)
			} catch (err) {
				if (!isDisposed && !isRetryingRef.current) {
					console.error("[WebRTC] Signaling handshake failed:", err)
					handleNetworkFailure()
				}
			}
		})()

		// -------------------------------------------------------------------
		// 6. Throughput watchdog: reconnect if video freezes for 15 s
		// -------------------------------------------------------------------

		let lastBytesReceived = 0
		let lastBytesTime = Date.now()

		const statsInterval = setInterval(async () => {
			if (isDisposed || isRetryingRef.current || !trackActiveRef.current) return
			try {
				const stats = await pc.getStats()
				for (const report of stats.values()) {
					if (report.type === "inbound-rtp" && report.kind === "video") {
						const bytes = report.bytesReceived
						const now = Date.now()
						if (bytes > lastBytesReceived) {
							lastBytesReceived = bytes
							lastBytesTime = now
						} else if (now - lastBytesTime > 15_000) {
							console.warn("[WebRTC] Video freeze detected – reconnecting…")
							handleNetworkFailure()
						}
						break
					}
				}
			} catch (err) {
				console.error("[WebRTC] Failed to fetch stats:", err)
			}
		}, 2000)

		// -------------------------------------------------------------------
		// Cleanup
		// -------------------------------------------------------------------

		return () => {
			isDisposed = true
			clearInterval(statsInterval)

			// Gracefully tell the server to close the session
			if (sessionIdRef.current && token) {
				signalingDelete("/api/rtc/session", token, {
					sessionId: sessionIdRef.current,
				})
				sessionIdRef.current = null
			}

			cleanup()
			setActiveSessionId(null)
			setTrackActive(false)
			setVideoStream(null)
		}
	}, [
		token,
		registerDataChannel,
		handleNetworkFailure,
		reconnectAttempt,
		cleanup,
	])

	return {
		trackActive,
		videoStream,
		error,
		errorHandle,
		connecting,
		reconnect,
		sendInputEvent,
		activeSessionId,
	}
}
