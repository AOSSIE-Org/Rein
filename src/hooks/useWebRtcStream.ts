"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

interface UseWebRtcStreamOptions {
	token: string | null
}
const MAX_RETRIES = 5

export function useWebRtcStream({ token }: UseWebRtcStreamOptions) {
	const [trackActive, setTrackActive] = useState(false)
	const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [errorHandle, setErrorHandle] = useState<string | null>(null)
	const [reconnectAttempt, setReconnectAttempt] = useState(0)
	const { registerDataChannel, send: sendInputEvent } = useConnection()

	const videoPcRef = useRef<RTCPeerConnection | null>(null)
	const inputPcRef = useRef<RTCPeerConnection | null>(null)
	const sseSourceRef = useRef<EventSource | null>(null)
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const trackActiveRef = useRef(false)
	const retryCountRef = useRef(0)

	useEffect(() => {
		trackActiveRef.current = trackActive
	}, [trackActive])

	useEffect(() => {
		return () => {
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current)
			}
		}
	}, [])

	const checkServerActive = useCallback(async (): Promise<boolean> => {
		try {
			const headers: Record<string, string> = {}
			if (token) {
				headers.Authorization = `Bearer ${token}`
			}
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000)
			const response = await fetch("/api/host/status", {
				headers,
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			return response.ok
		} catch {
			return false
		}
	}, [token])

	const triggerRetry = useCallback(() => {
		if (retryTimerRef.current) return

		if (retryCountRef.current >= MAX_RETRIES) {
			console.warn(
				`[WebRTC] Max retry attempts (${MAX_RETRIES}) reached. Stopping retries.`,
			)
			setErrorHandle("Connection Failed")
			setError("Failed to establish stream session after multiple attempts")
			return
		}

		if (sseSourceRef.current) {
			sseSourceRef.current.close()
			sseSourceRef.current = null
		}
		if (videoPcRef.current) {
			videoPcRef.current.close()
			videoPcRef.current = null
		}
		if (inputPcRef.current) {
			inputPcRef.current.close()
			inputPcRef.current = null
		}

		setTrackActive(false)
		setVideoStream(null)
		setActiveSessionId(null)

		const backoffDelay = Math.min(2000 * 2 ** retryCountRef.current, 30000)

		console.log(
			`[WebRTC] Startup/transient network failure, retrying automatically (attempt ${retryCountRef.current + 1}/${MAX_RETRIES}) in ${backoffDelay / 1000} seconds...`,
		)
		retryTimerRef.current = setTimeout(() => {
			retryTimerRef.current = null
			retryCountRef.current += 1
			setReconnectAttempt((prev) => prev + 1)
		}, backoffDelay)
	}, [])

	const handleNetworkFailure = useCallback(async () => {
		const isServerOnline = await checkServerActive()
		if (isServerOnline) {
			triggerRetry()
		} else {
			setErrorHandle("Server Error")
			setError("Server has quit or is unreachable")
		}
	}, [checkServerActive, triggerRetry])

	const reconnect = () => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current)
			retryTimerRef.current = null
		}
		if (sseSourceRef.current) {
			sseSourceRef.current.close()
			sseSourceRef.current = null
		}
		if (videoPcRef.current) {
			videoPcRef.current.close()
			videoPcRef.current = null
		}
		if (inputPcRef.current) {
			inputPcRef.current.close()
			inputPcRef.current = null
		}
		setErrorHandle(null)
		setError(null)
		setTrackActive(false)
		setVideoStream(null)
		setActiveSessionId(null)
		retryCountRef.current = 0
		setReconnectAttempt((prev) => prev + 1)
	}

	// Session provisioning
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search)
		const querySessionId = urlParams.get("session")

		if (querySessionId && reconnectAttempt === 0) {
			setActiveSessionId(querySessionId)
			return
		}
		if (!token) return

		fetch("/api/session", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((r) => {
				if (!r.ok) {
					throw new Error(`Session creation failed with status ${r.status}`)
				}
				return r.json()
			})
			.then((data) => {
				if (data.sessionId) {
					setActiveSessionId(data.sessionId)
					// Update URL query param with new sessionId
					const newUrl = new URL(window.location.href)
					newUrl.searchParams.set("session", data.sessionId)
					window.history.replaceState({}, "", newUrl.toString())
				} else {
					throw new Error("Session ID missing from response")
				}
			})
			.catch((err) => {
				console.error("[WebRTC] Session init failed:", err)
				handleNetworkFailure()
			})
	}, [token, reconnectAttempt, handleNetworkFailure])

	useEffect(() => {
		if (!activeSessionId) return

		// ── Video PC: receives GStreamer stream, no DataChannel ──────────────
		const videoPc = new RTCPeerConnection({
			iceServers: [],
			bundlePolicy: "max-bundle",
		})
		videoPcRef.current = videoPc
		videoPc.addTransceiver("video", { direction: "recvonly" })

		videoPc.ontrack = (event) => {
			if (event.track.kind === "video" && event.streams[0]) {
				setVideoStream(event.streams[0])
				setTrackActive(true)
				retryCountRef.current = 0
			}
		}

		videoPc.onicecandidate = async (event) => {
			if (!event.candidate) return
			try {
				const response = await fetch("/api/webrtc/ice", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({
						sessionId: activeSessionId,
						from: "viewer",
						candidate: event.candidate.candidate,
						sdpMid: event.candidate.sdpMid,
						sdpMLineIndex: event.candidate.sdpMLineIndex,
					}),
				})
				if (!response.ok) {
					throw new Error(`ICE candidate post failed: ${response.status}`)
				}
			} catch (err) {
				console.error(err)
				handleNetworkFailure()
			}
		}

		const handleConnectionStateChange = (pc: RTCPeerConnection) => () => {
			if (
				pc.connectionState === "failed" ||
				pc.connectionState === "disconnected"
			) {
				handleNetworkFailure()
			}
		}

		videoPc.onconnectionstatechange = handleConnectionStateChange(videoPc)

		// ── Input PC: DataChannel only, no media ─────────────────────────────
		const inputPc = new RTCPeerConnection({ iceServers: [] })
		inputPcRef.current = inputPc

		const dcUnordered = inputPc.createDataChannel("input-unordered", {
			ordered: false,
			maxRetransmits: 0,
		})
		const dcOrdered = inputPc.createDataChannel("input-ordered", {
			ordered: true,
		})
		registerDataChannel(dcUnordered, dcOrdered)

		inputPc.onicecandidate = async (event) => {
			if (!event.candidate) return
			try {
				const response = await fetch("/api/webrtc/ice", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({
						sessionId: activeSessionId,
						from: "viewer-input",
						candidate: event.candidate.candidate,
						sdpMid: event.candidate.sdpMid,
						sdpMLineIndex: event.candidate.sdpMLineIndex,
					}),
				})
				if (!response.ok) {
					throw new Error(`ICE candidate post failed: ${response.status}`)
				}
			} catch (err) {
				console.error(err)
				handleNetworkFailure()
			}
		}

		inputPc.onconnectionstatechange = handleConnectionStateChange(inputPc)

		// ── SSE bridge: handles both video offer and input-answer ────────────
		const sseParams = new URLSearchParams({ sessionId: activeSessionId })
		if (token) sseParams.set("token", token)
		const sseUrl = `/api/webrtc/events?${sseParams.toString()}`
		const sse = new EventSource(sseUrl)
		sseSourceRef.current = sse

		const videoIceQueue: RTCIceCandidateInit[] = []
		const inputIceQueue: RTCIceCandidateInit[] = []

		sse.onerror = (event) => {
			sse.close()
			console.error("[WebRTC] SSE error:", event)
			handleNetworkFailure()
		}

		sse.addEventListener("stream-error", (event) => {
			try {
				const data = JSON.parse(event.data)
				setErrorHandle("Network Error")
				setError(data.message || `Stream error: ${data.type}`)
			} catch {
				setErrorHandle("Network Error")
				setError("Stream error occurred")
			}
		})

		// Video: GStreamer offers, browser answers
		sse.addEventListener("offer", async (event) => {
			const data = JSON.parse(event.data)
			if (!data.sdp) return
			try {
				await videoPc.setRemoteDescription(
					new RTCSessionDescription({ type: "offer", sdp: data.sdp }),
				)
				const answer = await videoPc.createAnswer()
				await videoPc.setLocalDescription(answer)
				const response = await fetch("/api/webrtc/answer", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({ sessionId: activeSessionId, sdp: answer.sdp }),
				})
				if (!response.ok) {
					throw new Error(`Answer post failed: ${response.status}`)
				}
				// Process queued video candidates
				while (videoIceQueue.length > 0) {
					const cand = videoIceQueue.shift()
					if (cand) {
						await videoPc
							.addIceCandidate(new RTCIceCandidate(cand))
							.catch(() => {})
					}
				}
			} catch (err) {
				console.error("[WebRTC] Video offer handling failed:", err)
				handleNetworkFailure()
			}
		})

		// Video: GStreamer ICE candidates
		sse.addEventListener("host-ice", async (event) => {
			const data = JSON.parse(event.data)
			if (!data.candidate) return
			const candidateInit = {
				candidate: data.candidate,
				sdpMid: data.sdpMid,
				sdpMLineIndex: data.sdpMLineIndex,
			}
			if (videoPc.remoteDescription) {
				try {
					await videoPc.addIceCandidate(new RTCIceCandidate(candidateInit))
				} catch {}
			} else {
				videoIceQueue.push(candidateInit)
			}
		})

		// Input: server sends back its answer to our input offer
		sse.addEventListener("input-answer", async (event) => {
			const data = JSON.parse(event.data)
			if (!data.sdp) return
			try {
				await inputPc.setRemoteDescription(
					new RTCSessionDescription({ type: "answer", sdp: data.sdp }),
				)
				// Process queued input candidates
				while (inputIceQueue.length > 0) {
					const cand = inputIceQueue.shift()
					if (cand) {
						await inputPc
							.addIceCandidate(new RTCIceCandidate(cand))
							.catch((err) => {
								console.error(
									"[WebRTC] Failed to add queued input candidate:",
									err,
								)
							})
					}
				}
			} catch (err) {
				console.error("[WebRTC] Input answer failed:", err)
				handleNetworkFailure()
			}
		})

		// Input: server sends back its ICE candidates
		sse.addEventListener("input-ice", async (event) => {
			const data = JSON.parse(event.data)
			if (!data.candidate) return
			const candidateInit = {
				candidate: data.candidate,
				sdpMid: data.sdpMid,
				sdpMLineIndex: data.sdpMLineIndex,
			}
			if (inputPc.remoteDescription) {
				try {
					await inputPc.addIceCandidate(new RTCIceCandidate(candidateInit))
				} catch (err) {
					console.error("[WebRTC] Failed to add input candidate:", err)
				}
			} else {
				inputIceQueue.push(candidateInit)
			}
		})
		const sendInputOffer = async () => {
			const offer = await inputPc.createOffer()
			await inputPc.setLocalDescription(offer)
			const response = await fetch("/api/webrtc/input-offer", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ sessionId: activeSessionId, sdp: offer.sdp }),
			})
			if (!response.ok) {
				throw new Error(`[WebRTC] Input offer failed: ${response.status}`)
			}
		}

		sendInputOffer().catch((err) => {
			console.error(err)
			handleNetworkFailure()
		})

		// Video stream watchdog to automatically recover from silent stream freezes
		let lastBytesReceived = 0
		let lastBytesTime = Date.now()
		const cancelled = false

		const statsInterval = setInterval(async () => {
			if (cancelled || !trackActiveRef.current) return
			try {
				const stats = await videoPc.getStats()
				let videoInbound = null
				for (const report of stats.values()) {
					if (report.type === "inbound-rtp" && report.kind === "video") {
						videoInbound = report
						break
					}
				}
				if (videoInbound) {
					const bytes = videoInbound.bytesReceived
					const now = Date.now()
					if (bytes > lastBytesReceived) {
						lastBytesReceived = bytes
						lastBytesTime = now
					} else if (now - lastBytesTime > 4000) {
						console.warn(
							"[WebRTC] Video stream freeze detected (no bytes received for 4s), reconnecting...",
						)
						handleNetworkFailure()
					}
				}
			} catch (err) {
				console.error("[WebRTC] Failed to fetch stats:", err)
			}
		}, 2000)

		return () => {
			clearInterval(statsInterval)
			sse.close()
			videoPc.close()
			inputPc.close()
			setTrackActive(false)
			setVideoStream(null)
		}
	}, [activeSessionId, token, registerDataChannel, handleNetworkFailure])

	return {
		trackActive,
		videoStream,
		error,
		errorHandle,
		reconnect,
		sendInputEvent,
		activeSessionId,
	}
}
