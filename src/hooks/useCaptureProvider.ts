"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Detect whether the browser can encode canvas frames as WebP.
// Firefox on some platforms (e.g. Wayland/Linux) may not support WebP
// encoding in canvas.toBlob, so we fall back to JPEG in that case.
function getSupportedMimeType(): string {
	try {
		const canvas = document.createElement("canvas")
		canvas.width = 1
		canvas.height = 1
		// toDataURL is synchronous and reliable for capability detection
		const data = canvas.toDataURL("image/webp")
		if (data.startsWith("data:image/webp")) return "image/webp"
	} catch {
		// ignore
	}
	return "image/jpeg"
}

export function useCaptureProvider(wsRef: React.RefObject<WebSocket | null>) {
	const [isSharing, setIsSharing] = useState(false)
	const videoRef = useRef<HTMLVideoElement | null>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const timerRef = useRef<number | null>(null)
	// Resolved once on first use so we do not recreate a canvas every frame
	const mimeTypeRef = useRef<string | null>(null)

	const stopSharing = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current)
			timerRef.current = null
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop()
			streamRef.current = null
		}
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "stop-provider" }))
		}
		setIsSharing(false)
	}, [wsRef])

	const captureFrame = useCallback(() => {
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

		// Use WebP when supported (smaller payload); fall back to JPEG for
		// browsers that cannot encode WebP (e.g. older Firefox on Wayland).
		const format = mimeTypeRef.current ?? "image/jpeg"
		const quality = 0.8

		canvas.toBlob(
			(blob) => {
				if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
					wsRef.current.send(blob)
				}
			},
			format,
			quality,
		)
	}, [wsRef])

	// Returns true when sharing was successfully started, false otherwise.
	// Callers can use this to decide whether to retry the permission prompt.
	const startSharing = useCallback(async (): Promise<boolean> => {
		try {
			// Resolve the best supported MIME type once
			if (!mimeTypeRef.current) {
				mimeTypeRef.current = getSupportedMimeType()
			}

			// Use only standard, cross-browser constraints.
			// Chrome-specific hints like `displaySurface` are omitted because
			// Firefox may treat unrecognised constraint keys as errors in strict
			// mode, causing the permission prompt to never appear (issue #297).
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
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
			video.srcObject = stream
			await video.play()

			streamRef.current = stream
			setIsSharing(true)

			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({ type: "start-provider" }))
			}

			// Start capture loop (approx 12 FPS)
			timerRef.current = window.setInterval(captureFrame, 80)

			// Handle stream termination (e.g. user clicks "Stop Sharing")
			stream.getVideoTracks()[0].onended = () => {
				stopSharing()
			}

			return true
		} catch (err) {
			console.error("Failed to start screen capture:", err)
			setIsSharing(false)
			return false
		}
	}, [wsRef, captureFrame, stopSharing])

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
