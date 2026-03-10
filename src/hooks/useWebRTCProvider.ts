"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

const RTC_CONFIG: RTCConfiguration = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export function useWebRTCProvider() {
	const { send, subscribe } = useConnection()
	const [isSharing, setIsSharing] = useState(false)
	const streamRef = useRef<MediaStream | null>(null)
	const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())

	const stopSharing = useCallback(() => {
		for (const pc of peersRef.current.values()) {
			pc.close()
		}
		peersRef.current.clear()

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}

		setIsSharing(false)
	}, [])

	const startSharing = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: { displaySurface: "monitor" },
				audio: false,
			})

			streamRef.current = stream
			setIsSharing(true)

			// Register as provider on the server
			send({ type: "start-provider" })

			// Handle user clicking "Stop sharing" in browser UI
			stream.getVideoTracks()[0].onended = () => {
				stopSharing()
			}
		} catch (err) {
			console.error("Failed to start screen capture:", err)
			setIsSharing(false)
		}
	}, [send, stopSharing])

	// Handle incoming WebRTC offers from consumers
	useEffect(() => {
		const unsubOffer = subscribe("webrtc-offer", async (msg: unknown) => {
			const { senderId, offer } = msg as {
				senderId: string
				offer: RTCSessionDescriptionInit
			}
			if (!streamRef.current || !senderId || !offer) return

			// Close existing connection for this consumer if any
			const existing = peersRef.current.get(senderId)
			if (existing) {
				existing.close()
			}

			const pc = new RTCPeerConnection(RTC_CONFIG)
			peersRef.current.set(senderId, pc)

			// Add all tracks from the captured screen stream
			for (const track of streamRef.current.getTracks()) {
				pc.addTrack(track, streamRef.current)
			}

			// Send ICE candidates to the consumer via signaling
			pc.onicecandidate = (event) => {
				if (event.candidate) {
					send({
						type: "webrtc-ice-candidate",
						targetId: senderId,
						candidate: event.candidate.toJSON(),
					})
				}
			}

			// Clean up on disconnection
			pc.onconnectionstatechange = () => {
				if (
					pc.connectionState === "disconnected" ||
					pc.connectionState === "failed" ||
					pc.connectionState === "closed"
				) {
					pc.close()
					peersRef.current.delete(senderId)
				}
			}

			await pc.setRemoteDescription(new RTCSessionDescription(offer))
			const answer = await pc.createAnswer()
			await pc.setLocalDescription(answer)

			send({
				type: "webrtc-answer",
				targetId: senderId,
				answer: pc.localDescription,
			})
		})

		const unsubIce = subscribe("webrtc-ice-candidate", (msg: unknown) => {
			const { senderId, candidate } = msg as {
				senderId: string
				candidate: RTCIceCandidateInit
			}
			const pc = peersRef.current.get(senderId)
			if (pc && candidate) {
				pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
			}
		})

		return () => {
			unsubOffer()
			unsubIce()
		}
	}, [subscribe, send])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			for (const pc of peersRef.current.values()) pc.close()
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) track.stop()
			}
		}
	}, [])

	return { isSharing, startSharing, stopSharing }
}
