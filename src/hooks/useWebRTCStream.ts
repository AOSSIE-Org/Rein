"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useWebRTCStream(
	wsRef: React.RefObject<WebSocket | null>,
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
	status: "connecting" | "connected" | "disconnected",
) {
	const [hasFrame, setHasFrame] = useState(false)
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
	const remoteStreamRef = useRef<MediaStream | null>(null)
	const videoRef = useRef<HTMLVideoElement | null>(null)
	const rAFRef = useRef<number | null>(null)
	const frameRef = useRef<ImageBitmap | null>(null)

	const renderFrame = useCallback(() => {
		if (!canvasRef.current || !frameRef.current) return

		const canvas = canvasRef.current
		const ctx = canvas.getContext("2d", {
			alpha: false,
			desynchronized: true,
		})
		if (!ctx) return

		if (
			canvas.width !== frameRef.current.width ||
			canvas.height !== frameRef.current.height
		) {
			canvas.width = frameRef.current.width
			canvas.height = frameRef.current.height
		}

		ctx.drawImage(frameRef.current, 0, 0)
		rAFRef.current = null
	}, [canvasRef])

	const processVideoFrame = useCallback(
		async (stream: MediaStream) => {
			const video = document.createElement("video")
			video.srcObject = stream
			video.muted = true
			video.playsInline = true
			await video.play()

			const processFrame = () => {
				const canvas = document.createElement("canvas")
				canvas.width = video.videoWidth
				canvas.height = video.videoHeight
				const ctx = canvas.getContext("2d", { alpha: false })
				if (!ctx) return

				ctx.drawImage(video, 0, 0)

				createImageBitmap(canvas).then((bitmap) => {
					if (frameRef.current) {
						frameRef.current.close()
					}
					frameRef.current = bitmap
					setHasFrame(true)

					if (!rAFRef.current) {
						rAFRef.current = requestAnimationFrame(renderFrame)
					}
				})

				if (remoteStreamRef.current) {
					rAFRef.current = requestAnimationFrame(processFrame)
				}
			}

			processFrame()
		},
		[renderFrame],
	)

	const startStream = useCallback(() => {
		const pc = new RTCPeerConnection({ iceServers: [] })
		peerConnectionRef.current = pc

		pc.ontrack = (event) => {
			if (event.streams[0]) {
				remoteStreamRef.current = event.streams[0]
				processVideoFrame(event.streams[0])
			}
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

		wsRef.current.send(JSON.stringify({ type: "start-webrtc-consumer" }))
	}, [wsRef, processVideoFrame])

	const stopStream = useCallback(() => {
		if (rAFRef.current) {
			cancelAnimationFrame(rAFRef.current)
			rAFRef.current = null
		}

		if (frameRef.current) {
			frameRef.current.close()
			frameRef.current = null
		}

		if (remoteStreamRef.current) {
			for (const t of remoteStreamRef.current.getTracks()) {
				t.stop()
			}
			remoteStreamRef.current = null
		}

		if (peerConnectionRef.current) {
			peerConnectionRef.current.close()
			peerConnectionRef.current = null
		}

		setHasFrame(false)
	}, [])

	useEffect(() => {
		if (
			status === "connected" &&
			wsRef.current?.readyState === WebSocket.OPEN
		) {
			startStream()
		} else if (status === "disconnected") {
			stopStream()
		}

		return () => {
			stopStream()
		}
	}, [status, startStream, stopStream, wsRef.current?.readyState])

	useEffect(() => {
		if (!wsRef.current || status !== "connected") return

		const handleMessage = async (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data)

				if (data.type === "webrtc-offer") {
					if (!peerConnectionRef.current) return

					const offer = new RTCSessionDescription(data.payload)
					await peerConnectionRef.current.setRemoteDescription(offer)

					const answer = await peerConnectionRef.current.createAnswer()
					await peerConnectionRef.current.setLocalDescription(answer)

					wsRef.current?.send(
						JSON.stringify({
							type: "webrtc-answer",
							payload: answer,
						}),
					)
				} else if (data.type === "webrtc-ice") {
					if (!peerConnectionRef.current) return

					const candidate = new RTCIceCandidate(data.payload)
					await peerConnectionRef.current.addIceCandidate(candidate)
				}
			} catch (err) {
				console.error("Error handling WebRTC message:", err)
			}
		}

		wsRef.current.addEventListener("message", handleMessage)
		return () => wsRef.current?.removeEventListener("message", handleMessage)
	}, [wsRef, status])

	return { hasFrame }
}
