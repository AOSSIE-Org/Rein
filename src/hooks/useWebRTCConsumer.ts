import { useCallback, useEffect, useRef, useState } from "react"
import { ICE_SERVERS } from "../config/webrtc"
import { useConnection } from "../contexts/ConnectionProvider"
import type { SignalingMessage } from "../types/webrtc"

/**
 * WebRTC consumer hook.
 * Receives remote MediaStream from the desktop provider via signaling.
 */
export function useWebRTCConsumer(enabled = true) {
	const { status: _status, send, subscribe } = useConnection()
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
	const pcRef = useRef<RTCPeerConnection | null>(null)

	const stopConnection = useCallback(() => {
		if (pcRef.current) {
			pcRef.current.close()
			pcRef.current = null
		}
		setRemoteStream(null)
	}, [])

	const createPeerConnection = useCallback(() => {
		if (pcRef.current) return pcRef.current

		const pc = new RTCPeerConnection(ICE_SERVERS)

		// Set up track listener
		pc.ontrack = (event) => {
			if (event.streams?.[0]) {
				const stream = event.streams[0]
				console.info("WebRTC Consumer: Received remote stream")
				setRemoteStream(stream)

				// Log track status for debugging
				for (const track of stream.getVideoTracks()) {
					track.onmute = () =>
						console.info("WebRTC Consumer: Remote track muted")
					track.onunmute = () =>
						console.info("WebRTC Consumer: Remote track unmuted")
					track.onended = () =>
						console.info("WebRTC Consumer: Remote track ended")
				}
			}
		}

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				send({
					type: "webrtc-signal",
					candidate: event.candidate,
				})
			}
		}

		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "failed" || pc.connectionState === "closed") {
				stopConnection()
			}
		}

		pcRef.current = pc
		return pc
	}, [send, stopConnection])

	const handleSignal = useCallback(
		async (msg: SignalingMessage) => {
			if (!enabled) return
			try {
				if (msg.offer) {
					const pc = createPeerConnection()
					await pc.setRemoteDescription(new RTCSessionDescription(msg.offer))
					const answer = await pc.createAnswer()
					await pc.setLocalDescription(answer)
					send({ type: "webrtc-signal", answer })
				} else if (msg.answer && pcRef.current) {
					await pcRef.current.setRemoteDescription(
						new RTCSessionDescription(msg.answer),
					)
				} else if (msg.candidate && pcRef.current) {
					await pcRef.current.addIceCandidate(
						new RTCIceCandidate(msg.candidate),
					)
				}
			} catch (err) {
				console.error("WebRTC Consumer: Signaling error:", err)
			}
		},
		[createPeerConnection, enabled, send],
	)

	useEffect(() => {
		if (_status !== "connected" || !enabled) return

		const unsubscribe = subscribe("webrtc-signal", handleSignal)

		// Register as consumer to trigger provider offers via implicit signaling
		send({ type: "start-mirror" })

		return () => {
			unsubscribe()
			stopConnection()
		}
	}, [_status, handleSignal, stopConnection, enabled, subscribe, send])

	return {
		remoteStream,
		stopConnection,
	}
}
