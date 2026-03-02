"use client"

import { useCallback, useRef, useState } from "react"

export function useWebRTCProvider(wsRef: React.RefObject<WebSocket | null>) {
	const [isSharing, setIsSharing] = useState(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const streamRef = useRef<MediaStream | null>(null)

	const startSharing = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: true,
			})

			const pc = new RTCPeerConnection({
				iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			})

			stream.getTracks().forEach((track) => {
				pc.addTrack(track, stream)
			})

			pc.onicecandidate = (event) => {
				if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
					wsRef.current.send(
						JSON.stringify({
							type: "ice-candidate",
							candidate: event.candidate,
						}),
					)
				}
			}

			const offer = await pc.createOffer()
			await pc.setLocalDescription(offer)

			wsRef.current?.send(
				JSON.stringify({
					type: "webrtc-offer",
					offer,
				}),
			)

			pcRef.current = pc
			streamRef.current = stream
			setIsSharing(true)
		} catch (err) {
			console.error("Failed to start WebRTC capture:", err)
		}
	}, [wsRef])

	const stopSharing = useCallback(() => {
		streamRef.current?.getTracks().forEach((track) => track.stop())
		pcRef.current?.close()
		pcRef.current = null
		streamRef.current = null
		setIsSharing(false)
	}, [])

	return {
		isSharing,
		startSharing,
		stopSharing,
	}
}
