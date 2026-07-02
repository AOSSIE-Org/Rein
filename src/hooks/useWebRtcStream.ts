"use client"

import { useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

interface UseWebRtcStreamOptions {
	token: string | null
}

export function useWebRtcStream({ token }: UseWebRtcStreamOptions) {
	const [trackActive, setTrackActive] = useState(false)
	const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
	const { registerDataChannel, send: sendInputEvent } = useConnection()

	const videoPcRef = useRef<RTCPeerConnection | null>(null)
	const inputPcRef = useRef<RTCPeerConnection | null>(null)
	const sseSourceRef = useRef<EventSource | null>(null)

	// Session provisioning
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search)
		const querySessionId = urlParams.get("session")

		if (querySessionId) {
			setActiveSessionId(querySessionId)
			return
		}
		if (!token) return

		fetch("/api/session", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.sessionId) setActiveSessionId(data.sessionId)
			})
			.catch((err) => console.error("[WebRTC] Session init failed:", err))
	}, [token])

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
			}
		}

		videoPc.onicecandidate = async (event) => {
			if (!event.candidate) return
			await fetch("/api/webrtc/ice", {
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
			}).catch(console.error)
		}

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
			await fetch("/api/webrtc/ice", {
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
			}).catch(console.error)
		}

		// ── SSE bridge: handles both video offer and input-answer ────────────
		const sseParams = new URLSearchParams({ sessionId: activeSessionId })
		if (token) sseParams.set("token", token)
		const sseUrl = `/api/webrtc/events?${sseParams.toString()}`
		const sse = new EventSource(sseUrl)
		sseSourceRef.current = sse

		const videoIceQueue: RTCIceCandidateInit[] = []
		const inputIceQueue: RTCIceCandidateInit[] = []

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
				await fetch("/api/webrtc/answer", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({ sessionId: activeSessionId, sdp: answer.sdp }),
				})
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

		sendInputOffer().catch(console.error)

		return () => {
			sse.close()
			videoPc.close()
			inputPc.close()
			setTrackActive(false)
			setVideoStream(null)
		}
	}, [activeSessionId, token, registerDataChannel])

	return { trackActive, videoStream, sendInputEvent }
}
