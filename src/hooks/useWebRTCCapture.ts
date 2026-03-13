/**
 * useWebRTCCapture.ts
 *
 * Proof-of-concept WebRTC screen capture hook for Issue #208.
 * Replaces useCaptureProvider.ts entirely.
 *
 * Key differences vs the canvas/JPEG approach:
 * - No FPS cap: H.264/VP8/VP9 hardware encoder runs at full display refresh rate
 * - Wayland works: getDisplayMedia() in Electron triggers xdg-desktop-portal
 *   (pipewire) automatically — no WAYLAND_DISPLAY config needed
 * - No canvas, no toBlob(), no WebSocket binary frames — WebRTC handles encoding
 * - ICE signalling reuses the existing HTTP server via /api/webrtc-signal
 *
 * Usage (host side — the machine being controlled):
 *   const { startCapture, stopCapture, isCapturing } = useWebRTCCapture()
 *   await startCapture(sessionId)   // opens getDisplayMedia picker
 *
 * The viewer (mobile browser) connects to /api/webrtc-signal with the same
 * sessionId, receives the SDP answer, and renders the stream in a <video>.
 *
 * Full GSoC implementation will:
 * - Delete useCaptureProvider.ts
 * - Delete useMirrorStream.ts (canvas consumer)
 * - Replace with this hook + useWebRTCViewer.ts on the client side
 */

"use client"

import { useCallback, useRef, useState } from "react"

interface SignalMessage {
	type: "offer" | "answer" | "ice-candidate" | "bye"
	sessionId: string
	payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null
}

async function signal(msg: SignalMessage): Promise<SignalMessage | null> {
	const res = await fetch("/api/webrtc-signal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(msg),
	})
	if (!res.ok) return null
	return res.json() as Promise<SignalMessage>
}

export function useWebRTCCapture() {
	const [isCapturing, setIsCapturing] = useState(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const streamRef = useRef<MediaStream | null>(null)

	const stopCapture = useCallback(() => {
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}
		if (pcRef.current) {
			pcRef.current.close()
			pcRef.current = null
		}
		setIsCapturing(false)
	}, [])

	const startCapture = useCallback(
		async (sessionId: string) => {
			try {
				// getDisplayMedia: triggers Wayland pipewire portal automatically in Electron
				const stream = await navigator.mediaDevices.getDisplayMedia({
					video: { frameRate: { ideal: 60, max: 60 } },
					audio: false,
				})

				streamRef.current = stream

				// LAN-only — no STUN/TURN needed, ICE will resolve local addresses directly
				const pc = new RTCPeerConnection({ iceServers: [] })
				pcRef.current = pc

				// Add all video tracks to the peer connection
				for (const track of stream.getTracks()) {
					pc.addTrack(track, stream)
				}

				// Trickle ICE: send candidates to signalling server as they arrive
				pc.onicecandidate = ({ candidate }) => {
					if (candidate) {
						signal({
							type: "ice-candidate",
							sessionId,
							payload: candidate.toJSON(),
						}).catch(console.error)
					}
				}

				// Create SDP offer and send to signalling server
				const offer = await pc.createOffer()
				await pc.setLocalDescription(offer)

				const response = await signal({
					type: "offer",
					sessionId,
					payload: offer,
				})

				if (response?.payload) {
					await pc.setRemoteDescription(
						response.payload as RTCSessionDescriptionInit,
					)
					setIsCapturing(true)
				}

				// Handle stream ending (user clicks "Stop sharing" in OS dialog)
				stream.getVideoTracks()[0].onended = () => stopCapture()
			} catch (err) {
				console.error("useWebRTCCapture: failed to start", err)
				stopCapture()
			}
		},
		[stopCapture],
	)

	return { isCapturing, startCapture, stopCapture }
}
