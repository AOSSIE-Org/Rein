"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

const RTC_CONFIG: RTCConfiguration = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export function useWebRTCConsumer(
	videoRef: React.RefObject<HTMLVideoElement | null>,
) {
	const { send, subscribe, status } = useConnection()
	const [hasStream, setHasStream] = useState(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([])

	const cleanup = useCallback(() => {
		if (pcRef.current) {
			pcRef.current.close()
			pcRef.current = null
		}
		if (videoRef.current) {
			videoRef.current.srcObject = null
		}
		iceCandidateQueue.current = []
		setHasStream(false)
	}, [videoRef])

	useEffect(() => {
		if (status !== "connected") {
			cleanup()
			return
		}

		// Register as consumer on the server
		send({ type: "start-mirror" })

		const startConnection = () => {
			// Clean up any previous connection
			if (pcRef.current) {
				pcRef.current.close()
				pcRef.current = null
			}
			iceCandidateQueue.current = []
			setHasStream(false)

			const pc = new RTCPeerConnection(RTC_CONFIG)
			pcRef.current = pc

			// When the provider's stream arrives, attach to video element
			pc.ontrack = (event) => {
				if (videoRef.current && event.streams[0]) {
					videoRef.current.srcObject = event.streams[0]
					videoRef.current.play().catch(() => {})
					setHasStream(true)
				}
			}

			// Send ICE candidates to the provider via signaling
			pc.onicecandidate = (event) => {
				if (event.candidate) {
					send({
						type: "webrtc-ice-candidate",
						candidate: event.candidate.toJSON(),
					})
				}
			}

			pc.onconnectionstatechange = () => {
				if (
					pc.connectionState === "disconnected" ||
					pc.connectionState === "failed"
				) {
					setHasStream(false)
				}
			}

			// We only want to receive video
			pc.addTransceiver("video", { direction: "recvonly" })

			// Create and send offer to the provider
			pc.createOffer()
				.then((offer) => pc.setLocalDescription(offer))
				.then(() => {
					send({
						type: "webrtc-offer",
						offer: pc.localDescription,
					})
				})
				.catch((err) => console.error("Failed to create WebRTC offer:", err))
		}

		// Start connection when provider is ready
		const unsubProvider = subscribe("provider-ready", () => {
			startConnection()
		})

		// Handle answer from provider
		const unsubAnswer = subscribe("webrtc-answer", async (msg: unknown) => {
			const { answer } = msg as { answer: RTCSessionDescriptionInit }
			if (!answer || !pcRef.current) return

			await pcRef.current.setRemoteDescription(
				new RTCSessionDescription(answer),
			)

			// Flush queued ICE candidates
			for (const candidate of iceCandidateQueue.current) {
				await pcRef.current
					.addIceCandidate(new RTCIceCandidate(candidate))
					.catch(() => {})
			}
			iceCandidateQueue.current = []
		})

		// Handle ICE candidates from provider
		const unsubIce = subscribe("webrtc-ice-candidate", async (msg: unknown) => {
			const { candidate } = msg as { candidate: RTCIceCandidateInit }
			if (!candidate) return

			if (pcRef.current?.remoteDescription) {
				await pcRef.current
					.addIceCandidate(new RTCIceCandidate(candidate))
					.catch(() => {})
			} else {
				// Queue candidates until remote description is set
				iceCandidateQueue.current.push(candidate)
			}
		})

		return () => {
			unsubProvider()
			unsubAnswer()
			unsubIce()
			cleanup()
		}
	}, [status, send, subscribe, videoRef, cleanup])

	return { hasStream }
}
