"use client"
/**
 * Screen Capture Provider Hook
 * This hook manages the logic for capturing the provider's screen, handling WebRTC data channels,
 * and streaming video to a remote consumer.
 */

import { useConnection } from "../contexts/ConnectionProvider"
import { useEffect, useRef, useState, useCallback } from "react"

interface ElectronWindow extends Window {
	electron?: {
		showSourcePicker: () => Promise<string | null>
	}
}

interface ElectronDesktopConstraints {
	audio?: {
		mandatory: {
			chromeMediaSource: "desktop"
		}
	}
	video: {
		mandatory: {
			chromeMediaSource: "desktop"
			chromeMediaSourceId: string
		}
	}
}

export function useCaptureProvider() {
	const {
		pcRef,
		send,
		subscribe,
		createPeerConnection,
		status,
		configureMediaSender,
		closePeerConnection,
	} = useConnection()
	const [isSharing, setIsSharing] = useState(false)
	const senderRef = useRef<RTCRtpSender | null>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const isRequestingRef = useRef(false)

	const stopSharing = useCallback(() => {
		if (senderRef.current && pcRef.current) {
			try {
				pcRef.current.removeTrack(senderRef.current)
			} catch {}
			senderRef.current = null
		}
		if (pcRef.current) {
			closePeerConnection()
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}
		setIsSharing(false)
	}, [pcRef, closePeerConnection])

	const handleConsumerJoined = useCallback(async () => {
		if (isRequestingRef.current) return

		try {
			let stream = streamRef.current
			if (!stream?.active) {
				isRequestingRef.current = true // Set lock

				// ── Electron Native Sniffing Flow ──
				const electron = (window as ElectronWindow).electron
				if (electron?.showSourcePicker) {
					const sourceId = await electron.showSourcePicker()
					if (sourceId) {
						const constraints: ElectronDesktopConstraints = {
							audio: {
								mandatory: {
									chromeMediaSource: "desktop",
								},
							},
							video: {
								mandatory: {
									chromeMediaSource: "desktop",
									chromeMediaSourceId: sourceId,
								},
							},
						}
						stream = await navigator.mediaDevices.getUserMedia(
							constraints as MediaStreamConstraints,
						)
					} else {
						// Fallback if dialog dismissed with no ID
						stream = await navigator.mediaDevices.getDisplayMedia({
							video: true,
							audio: true,
						})
					}
				} else {
					// ── Standard Browser Fallback Flow ──
					stream = await navigator.mediaDevices.getDisplayMedia({
						video: true,
						audio: true,
					})
				}

				streamRef.current = stream
				stream
					.getVideoTracks()[0]
					?.addEventListener("ended", stopSharing, { once: true })
			}

			if (pcRef.current) closePeerConnection()
			pcRef.current = createPeerConnection()

			const dcUnordered = pcRef.current.createDataChannel("dc-unordered", {
				ordered: false,
				maxRetransmits: 0,
			})
			const dcOrdered = pcRef.current.createDataChannel("dc-ordered", {
				ordered: true,
			})

			const handleIncomingInput = (event: MessageEvent) => {
				try {
					const msg = JSON.parse(event.data)
					if (!msg || typeof msg !== "object" || !msg.type) {
						console.warn("[RTC] Invalid message format:", msg)
						return
					}
					send(msg)
				} catch (err) {
					console.error("[RTC] Failed to relay input", err)
				}
			}
			dcUnordered.onmessage = handleIncomingInput
			dcOrdered.onmessage = handleIncomingInput

			const track = stream.getVideoTracks()[0]
			const sender = pcRef.current.addTrack(track, stream)
			senderRef.current = sender

			// Apply bitrate caps and codec preferences immediately if optimization engine is exposed
			if (configureMediaSender) {
				configureMediaSender(pcRef.current, sender)
			}

			setIsSharing(true)
		} catch (err) {
			console.error("Failed to start screen capture:", err)
			stopSharing()
		} finally {
			isRequestingRef.current = false // Release lock
		}
	}, [
		createPeerConnection,
		closePeerConnection,
		pcRef,
		stopSharing,
		send,
		configureMediaSender,
	])

	// Register as provider when WebSocket connects
	useEffect(() => {
		if (status === "connected") {
			send({ type: "start-provider" })
		}
	}, [status, send])

	// Event-driven lifecycle bindings
	useEffect(() => {
		const unsubJoined = subscribe("consumer_joined", handleConsumerJoined)
		const unsubLeft = subscribe("consumer_left", stopSharing)

		return () => {
			unsubJoined()
			unsubLeft()
		}
	}, [subscribe, handleConsumerJoined, stopSharing])

	// Cleanup on unmount
	useEffect(() => {
		return () => stopSharing()
	}, [stopSharing])

	return { isSharing }
}
