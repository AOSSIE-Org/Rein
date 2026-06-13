"use client"

import { useEffect, useRef, useState } from "react"

export function useCaptureProvider(wsRef: React.RefObject<WebSocket | null>) {
	const [isSharing, setIsSharing] = useState(false)
	const videoRef = useRef<HTMLVideoElement | null>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const timerRef = useRef<number | null>(null)

	const stopSharing = () => {
		if (timerRef.current) {
			clearInterval(timerRef.current)
			timerRef.current = null
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}
		if (videoRef.current) {
			videoRef.current.pause()
			videoRef.current.srcObject = null
		}
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "stop-mirror" }))
		}
		setIsSharing(false)
	}
	const getConfig = () => ({
		sensitivity:
			Number.parseFloat(localStorage.getItem("rein_sensitivity") || "1.0") ||
			1.0,
		invertScroll: localStorage.getItem("rein_invert") === "true" || false,
	})

	const captureFrame = () => {
		if (!videoRef.current || !canvasRef.current || !wsRef.current) return
		if (wsRef.current.readyState !== WebSocket.OPEN) return

		// Backpressure: Skip frame if buffer is filling up (> 1MB)
		if (wsRef.current.bufferedAmount > 1024 * 1024) return

		const video = videoRef.current
		const canvas = canvasRef.current
		const ctx = canvas.getContext("2d", { alpha: false })
		if (!ctx) return

		// Latency Optimization: Cap resolution to 720p (ish)
		const MAX_DIM = 1280
		let width = video.videoWidth
		let height = video.videoHeight

		if (width > MAX_DIM || height > MAX_DIM) {
			const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
			width = Math.floor(width * ratio)
			height = Math.floor(height * ratio)
		}

		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width
			canvas.height = height
		}

		ctx.drawImage(video, 0, 0, width, height)

		// Adaptive Format/Quality: WebP is smaller, JPEG is faster to encode
		// We use slightly lower quality (0.5) for better latency
		const format = "image/webp"
		const quality = 1

		canvas.toBlob(
			(blob) => {
				if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
					wsRef.current.send(blob)
				}
			},
			format,
			quality,
		)
	}

	const startSharing = async () => {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					displaySurface: "monitor",
					// frameRate: { ideal: 30 },
				},
			})

			// Create hidden video to consume the stream
			if (!videoRef.current) {
				videoRef.current = document.createElement("video")
				videoRef.current.muted = true
				videoRef.current.playsInline = true
			}

			// Create hidden canvas for capturing frames
			if (!canvasRef.current) {
				canvasRef.current = document.createElement("canvas")
			}

			const video = videoRef.current
			const track = stream.getVideoTracks()[0]
			if (!track) {
				console.error("No video track found in stream")
				stream.getTracks().map((t) => t.stop())
				setIsSharing(false)
				return
			}
			const settings = track.getSettings()
			video.srcObject = stream
			await video.play()

			streamRef.current = stream
			setIsSharing(true)

			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						type: "start-provider",
						config: {
							...getConfig(),
							screenWidth: settings.width ?? 1920,
							screenHeight: settings.height ?? 1080,
						},
					}),
				)
			}

			// Start capture loop (approx 12 FPS)
			timerRef.current = window.setInterval(captureFrame, 80)

			// Handle stream termination (e.g. user clicks "Stop Sharing")
			stream.getVideoTracks()[0].onended = () => {
				stopSharing()
			}
		} catch (err) {
			console.error("Failed to start screen capture:", err)
			setIsSharing(false)
		}
	}

	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current)
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) track.stop()
			}
		}
	}, [])

	return {
		isSharing,
		startSharing,
		stopSharing,
	}
}
