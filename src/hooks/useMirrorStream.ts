"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useMirrorStream(
	wsRef: React.RefObject<WebSocket | null>,
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
	status: "connecting" | "connected" | "disconnected",
) {
	const [hasFrame, setHasFrame] = useState(false)
	const frameRef = useRef<ImageBitmap | null>(null)
	const rAFRef = useRef<number | null>(null)
	const isDecoding = useRef(false)

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

	const handleMessage = useCallback(
		async (event: MessageEvent) => {
			if (!(event.data instanceof Blob)) return

			// Frame Dropping: If we are already decoding or have a pending frame in rAF, skip this one.
			// This ensures we always show the freshest frame and don't build up a queue.
			if (isDecoding.current || rAFRef.current) return

			try {
				isDecoding.current = true
				const bitmap = await createImageBitmap(event.data)
				isDecoding.current = false

				if (frameRef.current) {
					frameRef.current.close()
				}
				frameRef.current = bitmap
				setHasFrame(true)

				// Use requestAnimationFrame for smooth, synced rendering
				rAFRef.current = requestAnimationFrame(renderFrame)
			} catch (e) {
				isDecoding.current = false
				console.error("Frame decoding error:", e)
			}
		},
		[renderFrame],
	)

	useEffect(() => {
		const ws = wsRef.current
		if (!ws || status !== "connected") {
			setHasFrame(false)
			return
		}

		ws.binaryType = "blob"
		ws.addEventListener("message", handleMessage)
		ws.send(JSON.stringify({ type: "start-mirror" }))

		return () => {
			ws.removeEventListener("message", handleMessage)
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "stop-mirror" }))
			}
			if (rAFRef.current) cancelAnimationFrame(rAFRef.current)
			if (frameRef.current) frameRef.current.close()
		}
	}, [wsRef, status, handleMessage])

	return { hasFrame }
}
