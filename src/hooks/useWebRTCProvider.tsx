"use client"

import {
	createContext,
	useContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react"
import { ICE_SERVERS } from "../config/webrtc"
import { useConnection } from "../contexts/ConnectionProvider"
import type { SignalingMessage } from "../types/webrtc"

type WebRTCContextType = {
	isSharing: boolean
	localStream: MediaStream | null
	startSharing: () => Promise<void>
	stopSharing: () => void
}

const WebRTCContext = createContext<WebRTCContextType | null>(null)

export const useWebRTC = () => {
	const context = useContext(WebRTCContext)
	if (!context) throw new Error("useWebRTC must be used within WebRTCProvider")
	return context
}

export function WebRTCProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const { status, send, subscribe } = useConnection()
	const [isSharing, setIsSharing] = useState(false)
	const [localStream, setLocalStream] = useState<MediaStream | null>(null)
	const isSharingRef = useRef(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const streamRef = useRef<MediaStream | null>(null)

	// Sync ref with state for use in callbacks to avoid stale closures
	useEffect(() => {
		isSharingRef.current = isSharing
	}, [isSharing])

	const stopSharing = useCallback(() => {
		if (pcRef.current) {
			pcRef.current.close()
			pcRef.current = null
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}
		setLocalStream(null)
		setIsSharing(false)
	}, [])

	const createPeerConnection = useCallback(() => {
		if (pcRef.current) return pcRef.current

		const pc = new RTCPeerConnection(ICE_SERVERS)

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
				stopSharing()
			}
		}

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				pc.addTrack(track, streamRef.current)
			}
		}

		pcRef.current = pc
		return pc
	}, [send, stopSharing])

	const handleSignal = useCallback(
		async (msg: SignalingMessage) => {
			try {
				if (msg.type === "consumer-joined") {
					if (isSharingRef.current && streamRef.current) {
						console.info("WebRTC Provider: Consumer joined, sending offer")
						const pc = createPeerConnection()
						const offer = await pc.createOffer()
						await pc.setLocalDescription(offer)
						send({ type: "webrtc-signal", offer })
					}
					return
				}

				if (!pcRef.current) return

				if (msg.answer) {
					await pcRef.current.setRemoteDescription(
						new RTCSessionDescription(msg.answer),
					)
				} else if (msg.candidate) {
					await pcRef.current.addIceCandidate(
						new RTCIceCandidate(msg.candidate),
					)
				}
			} catch (err) {
				console.error("WebRTC Provider: Signaling error:", err)
			}
		},
		[createPeerConnection, send],
	)

	const startSharing = useCallback(async () => {
		try {
			if (isSharingRef.current) stopSharing()

			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					frameRate: { ideal: 30 },
					width: { ideal: 1920 },
					// @ts-ignore - displaySurface is part of the spec but not always in typedefs
					displaySurface: "monitor",
				},
				audio: false,
				// @ts-ignore - Browser specific hints
				selfBrowserSurface: "exclude",
				monitorTypeSurfaces: "include",
				systemAudio: "exclude",
			} as DisplayMediaStreamOptions)

			for (const track of stream.getVideoTracks()) {
				track.onmute = () => console.info("WebRTC Provider: Track muted")
				track.onunmute = () => console.info("WebRTC Provider: Track unmuted")
				track.onended = () => {
					console.info("WebRTC Provider: Track ended")
					stopSharing()
				}
			}

			streamRef.current = stream
			setLocalStream(stream)
			setIsSharing(true)

			send({ type: "start-provider" })

			const pc = createPeerConnection()
			const offer = await pc.createOffer()
			await pc.setLocalDescription(offer)

			send({ type: "webrtc-signal", offer })
		} catch (err) {
			if (err instanceof Error && err.name !== "NotAllowedError") {
				console.error("WebRTC Provider: Failed to start sharing:", err)
			}
			setLocalStream(null)
			setIsSharing(false)
		}
	}, [stopSharing, createPeerConnection, send])

	useEffect(() => {
		if (status !== "connected") return

		const unsubscribeSignal = subscribe("webrtc-signal", handleSignal)
		const unsubscribeJoin = subscribe("consumer-joined", handleSignal)

		return () => {
			unsubscribeSignal()
			unsubscribeJoin()
		}
	}, [status, subscribe, handleSignal])

	// Auto-start screen capture on desktop when connected
	const autoStarted = useRef(false)
	useEffect(() => {
		if (autoStarted.current || isSharing) return
		if (status !== "connected") return

		// Robust mobile detection: combine regex with feature detection
		const isMobileRegex = /Mobi|Android|iPhone|iPad|iPod/i.test(
			navigator.userAgent,
		)
		const isTouchDevice =
			"ontouchstart" in window || navigator.maxTouchPoints > 0
		const canShare = !!navigator.mediaDevices?.getDisplayMedia

		if ((isMobileRegex && isTouchDevice) || !canShare) return

		autoStarted.current = true
		startSharing()
	}, [status, isSharing, startSharing])

	return (
		<WebRTCContext.Provider
			value={{ isSharing, localStream, startSharing, stopSharing }}
		>
			{children}
			{/* Hidden video element for local consumption (keeps stream active on Wayland/PipeWire) */}
			{isSharing && (
				<video
					ref={(node) => {
						if (node && streamRef.current) {
							node.srcObject = streamRef.current
							node.play().catch(() => {})
						}
					}}
					muted
					playsInline
					style={{ display: "none" }}
				/>
			)}
		</WebRTCContext.Provider>
	)
}
