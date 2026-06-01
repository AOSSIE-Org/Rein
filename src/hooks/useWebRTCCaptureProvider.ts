"use client"

import { useCallback, useEffect, useRef, useState } from "react"

interface RTCMessage {
	type: "offer" | "answer" | "ice-candidate"
	payload: RTCSessionDescriptionInit | RTCIceCandidateInit
}

export function useWebRTCCaptureProvider(
	wsRef: React.RefObject<WebSocket | null>,
	onConnectedChange?: (connected: boolean) => void,
) {
	const [isSharing, setIsSharing] = useState(false)
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
	const localStreamRef = useRef<MediaStream | null>(null)

	const stopSharing = useCallback(() => {
		if (localStreamRef.current) {
			for (const track of localStreamRef.current.getTracks()) {
				track.stop()
			}
			localStreamRef.current = null
		}

		if (peerConnectionRef.current) {
			peerConnectionRef.current.close()
			peerConnectionRef.current = null
		}

		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "stop-webrtc-provider" }))
		}

		setIsSharing(false)
		onConnectedChange?.(false)
	}, [wsRef, onConnectedChange])

	const startSharing = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					displaySurface: "monitor",
					width: { ideal: 1920 },
					height: { ideal: 1080 },
					frameRate: { ideal: 60 },
				},
				audio: false,
			})

			localStreamRef.current = stream

			const config: RTCConfiguration = {
				iceServers: [],
			}

			const pc = new RTCPeerConnection(config)
			peerConnectionRef.current = pc

			for (const track of stream.getVideoTracks()) {
				pc.addTrack(track, stream)
			}

			pc.onicecandidate = (event) => {
				if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
					wsRef.current.send(
						JSON.stringify({
							type: "webrtc-ice",
							payload: event.candidate.toJSON(),
						}),
					)
				}
			}

			pc.onconnectionstatechange = () => {
				const state = pc.connectionState
				console.log("[WebRTC] Connection state:", state)

				if (state === "connected") {
					onConnectedChange?.(true)
				} else if (
					state === "disconnected" ||
					state === "failed" ||
					state === "closed"
				) {
					onConnectedChange?.(false)
				}
			}

			const offer = await pc.createOffer()
			await pc.setLocalDescription(offer)

			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						type: "webrtc-offer",
						payload: offer,
					}),
				)
			}

			stream.getVideoTracks()[0].onended = () => {
				stopSharing()
			}

			setIsSharing(true)
		} catch (err) {
			console.error("Failed to start WebRTC screen capture:", err)
			setIsSharing(false)
		}
	}, [wsRef, stopSharing, onConnectedChange])

	useEffect(() => {
		return () => {
			stopSharing()
		}
	}, [stopSharing])

	useEffect(() => {
		if (!wsRef.current) return

		const handleMessage = (event: MessageEvent) => {
			if (peerConnectionRef.current?.remoteDescription) return

			try {
				const data = JSON.parse(event.data)

				if (data.type === "webrtc-answer") {
					const answer = new RTCSessionDescription(data.payload)
					peerConnectionRef.current?.setRemoteDescription(answer)
				} else if (data.type === "webrtc-ice") {
					const candidate = new RTCIceCandidate(data.payload)
					peerConnectionRef.current?.addIceCandidate(candidate)
				}
			} catch (err) {
				console.error("Error handling WebRTC message:", err)
			}
		}

		wsRef.current.addEventListener("message", handleMessage)
		return () => wsRef.current?.removeEventListener("message", handleMessage)
	}, [wsRef])

	return {
		isSharing,
		startSharing,
		stopSharing,
	}
}
