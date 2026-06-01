"use client"
/**
 * WebRTC Peer Connection Hook
 * This hook contains the logic for establishing and managing a WebRTC peer connection,
 * including optimizing stream parameters and fallback communication paths.
 */
import { useCallback, useRef } from "react"
const UNORDERED_TYPES = new Set(["move", "scroll", "zoom", "touch"])
type SignalingMessage =
	| { type: "offer"; sdp: RTCSessionDescriptionInit }
	| { type: "answer"; sdp: RTCSessionDescriptionInit }
	| { type: "ice-candidate"; candidate: RTCIceCandidateInit }

export function useWebRTC(
	send: (msg: unknown) => void,
	onTrack: (stream: MediaStream | null) => void,
) {
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const dcUnorderedRef = useRef<RTCDataChannel | null>(null)
	const dcOrderedRef = useRef<RTCDataChannel | null>(null)
	const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
	const sendRef = useRef(send)
	sendRef.current = send
	/** Configure adaptive bitrate optimization and codec preferences (H.264 > VP9 > AV1) */
	const configureMediaSender = useCallback(
		(pc: RTCPeerConnection, sender: RTCRtpSender) => {
			// 1. Force Max Adaptive Bitrate Configuration
			try {
				const params = sender.getParameters()
				if (!params.encodings || params.encodings.length === 0) {
					params.encodings = [{}]
				}
				params.encodings[0].maxBitrate = 5_000_000 // 5 Mbps maximum bandwidth cap
				params.encodings[0].scaleResolutionDownBy = 1.0 // Maintain native capture size
				sender.setParameters(params).catch(() => {})
			} catch (e) {
				console.warn(
					"[RTC] Adaptive bitrate tuning unsupported by browser environment.",
					e,
				)
			}

			// 2. Sort available system transceivers to prioritize H.264
			try {
				const transceiver = pc
					.getTransceivers()
					.find((t) => t.sender === sender)
				if (
					transceiver &&
					typeof transceiver.setCodecPreferences === "function"
				) {
					const capabilities = RTCRtpReceiver.getCapabilities?.("video")
					if (capabilities) {
						const codecs = capabilities.codecs
						const h264 = codecs.filter((c) => c.mimeType === "video/H264")
						const vp9 = codecs.filter((c) => c.mimeType === "video/VP9")
						const av1 = codecs.filter((c) => c.mimeType === "video/AV1")
						const rest = codecs.filter(
							(c) =>
								c.mimeType !== "video/H264" &&
								c.mimeType !== "video/VP9" &&
								c.mimeType !== "video/AV1",
						)
						const preferred = [...h264, ...vp9, ...av1, ...rest]
						if (preferred.length > 0) {
							transceiver.setCodecPreferences(preferred)
						}
					}
				}
			} catch (e) {
				console.warn("[RTC] Codec preference alignment API unavailable.", e)
			}
		},
		[],
	)

	const createPeerConnection = useCallback(() => {
		const pc = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.l.google.com:19302" },
				//if you are facing connection issue try using a TURN server. You can add it like this:
				// {
				// 	urls: "turn:turnserverurl:port",
				// 	username: "username",
				// 	credential: "password",
				// },
			],
			iceTransportPolicy: "all",
		})

		pc.onicecandidate = ({ candidate }) => {
			if (!candidate) return
			sendRef.current({
				type: "ice-candidate",
				candidate: candidate.toJSON(),
			})
		}

		pc.onconnectionstatechange = () => {
			console.log("[RTC] Connection State:", pc.connectionState)
			if (
				pc.connectionState === "failed" ||
				pc.connectionState === "disconnected" ||
				pc.connectionState === "closed"
			) {
				onTrack(null)
			}
		}

		pc.ontrack = (event) => {
			console.log("[RTC] track received")
			const stream = event.streams[0] ?? new MediaStream([event.track])
			event.track.addEventListener(
				"ended",
				() => {
					console.log("[RTC] track ended")
					onTrack(null)
				},
				{ once: true },
			)
			onTrack(stream)
		}

		pc.ondatachannel = (event) => {
			const dc = event.channel
			if (dc.label === "dc-unordered") {
				dcUnorderedRef.current = dc
			} else if (dc.label === "dc-ordered") {
				dcOrderedRef.current = dc
			}
		}

		pc.onnegotiationneeded = async () => {
			try {
				const offer = await pc.createOffer()
				await pc.setLocalDescription(offer)
				sendRef.current({ type: "offer", sdp: pc.localDescription })
			} catch (e) {
				console.error("[RTC] offer creation failed", e)
			}
		}

		return pc
	}, [onTrack])

	const handleSignalingMessage = useCallback(
		async (msg: SignalingMessage) => {
			try {
				if (msg.type === "offer") {
					if (!pcRef.current) {
						pcRef.current = createPeerConnection()
					}
					const pc = pcRef.current
					await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))

					for (const c of pendingIceCandidatesRef.current) {
						await pc.addIceCandidate(c)
					}
					pendingIceCandidatesRef.current = []

					const answer = await pc.createAnswer()
					await pc.setLocalDescription(answer)
					sendRef.current({ type: "answer", sdp: pc.localDescription })
				} else if (msg.type === "answer") {
					const pc = pcRef.current
					if (pc) {
						await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
						for (const c of pendingIceCandidatesRef.current) {
							await pc.addIceCandidate(c)
						}
						pendingIceCandidatesRef.current = []
					}
				} else if (msg.type === "ice-candidate") {
					const pc = pcRef.current
					if (pc?.remoteDescription) {
						await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
					} else {
						pendingIceCandidatesRef.current.push(msg.candidate)
					}
				}
			} catch (e) {
				console.error("[RTC] Failed to handle signaling message", e)
			}
		},
		[createPeerConnection],
	)

	const sendInput = useCallback((msg: unknown) => {
		const msgObj = msg as Record<string, unknown>
		const msgType = typeof msgObj?.type === "string" ? msgObj.type : ""
		const isUnordered = UNORDERED_TYPES.has(msgType)
		const dc = isUnordered ? dcUnorderedRef.current : dcOrderedRef.current

		if (dc && dc.readyState === "open") {
			try {
				dc.send(JSON.stringify(msg))
			} catch {
				sendRef.current(msg)
			}
		} else {
			sendRef.current(msg)
		}
	}, [])

	const closePeerConnection = useCallback(() => {
		if (pcRef.current) {
			pcRef.current.close()
			pcRef.current = null
		}

		dcUnorderedRef.current = null
		dcOrderedRef.current = null
		pendingIceCandidatesRef.current = []
	}, [])

	return {
		pcRef,
		createPeerConnection,
		handleSignalingMessage,
		sendInput,
		closePeerConnection,
		configureMediaSender,
	}
}
