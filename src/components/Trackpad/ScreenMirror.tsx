"use client"

import type React from "react"
import { useRef } from "react"
import { useConnection } from "../../contexts/ConnectionProvider"
import { useMirrorStream } from "../../hooks/useMirrorStream"
import { useRemoteConnection } from "../../hooks/useRemoteConnection"

interface ScreenMirrorProps {
	scrollMode: boolean
	isTracking: boolean
}

const TEXTS = {
	WAITING: "Waiting for screen...",
	AUTOMATIC: "Mirroring will start automatically",
}

export const ScreenMirror = ({ scrollMode, isTracking }: ScreenMirrorProps) => {
	const { wsRef, status } = useConnection()
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const { hasFrame } = useMirrorStream(wsRef, canvasRef, status)
	const { send } = useRemoteConnection()
	const lastPos = useRef<{ x: number; y: number } | null>(null)
	const lastMoveTime = useRef(0)

	const getAbsoluteCoords = (clientX: number, clientY: number) => {
		if (!canvasRef.current || !hasFrame) return null
		const canvas = canvasRef.current
		const rect = canvas.getBoundingClientRect()

		const cw = rect.width
		const ch = rect.height
		const iw = canvas.width
		const ih = canvas.height

		if (iw === 0 || ih === 0) return null

		const scale = Math.min(cw / iw, ch / ih)
		const dw = iw * scale
		const dh = ih * scale
		const offsetX = (cw - dw) / 2
		const offsetY = (ch - dh) / 2

		const cx = clientX - rect.left
		const cy = clientY - rect.top

		const x = (cx - offsetX) / scale
		const y = (cy - offsetY) / scale

		if (x < 0 || x > iw || y < 0 || y > ih) {
			return {
				x: Math.max(0, Math.min(iw, x)),
				y: Math.max(0, Math.min(ih, y)),
			}
		}

		return { x, y }
	}

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		const coords = getAbsoluteCoords(e.clientX, e.clientY)
		if (!coords) return

		e.currentTarget.setPointerCapture(e.pointerId)
		send({ type: "absolute", x: coords.x, y: coords.y })

		if (e.pointerType === "mouse") {
			const button =
				e.button === 0 ? "left" : e.button === 2 ? "right" : "middle"
			send({ type: "click", button, press: true })
		} else {
			if (!scrollMode) {
				send({ type: "click", button: "left", press: true })
			}
		}
		lastPos.current = { x: e.clientX, y: e.clientY }
	}

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const now = performance.now()
		if (now - lastMoveTime.current < 16) return
		lastMoveTime.current = now

		const coords = getAbsoluteCoords(e.clientX, e.clientY)
		if (!coords) return

		if (e.pointerType === "mouse") {
			send({ type: "absolute", x: coords.x, y: coords.y })
		} else {
			if (scrollMode && lastPos.current) {
				const dx = e.clientX - lastPos.current.x
				const dy = e.clientY - lastPos.current.y
				send({ type: "scroll", dx: -dx * 1.5, dy: -dy * 1.5 })
				lastPos.current = { x: e.clientX, y: e.clientY }
			} else if (lastPos.current) {
				send({ type: "absolute", x: coords.x, y: coords.y })
			}
		}
	}

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId)
		}
		if (e.pointerType === "mouse") {
			const button =
				e.button === 0 ? "left" : e.button === 2 ? "right" : "middle"
			send({ type: "click", button, press: false })
		} else {
			if (!scrollMode) {
				send({ type: "click", button: "left", press: false })
			}
		}
		lastPos.current = null
	}

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none touch-none">
			{/* Mirror Canvas */}
			<canvas
				ref={canvasRef}
				className={`w-full h-full object-contain transition-opacity duration-500 ${hasFrame ? "opacity-100" : "opacity-0"
					}`}
			/>

			{/* Standby UI */}
			{!hasFrame && (
				<div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4">
					<div className="loading loading-spinner loading-lg text-primary" />
					<div className="text-center px-6">
						<p className="font-semibold text-lg">{TEXTS.WAITING}</p>
						<p className="text-sm opacity-60">{TEXTS.AUTOMATIC}</p>
					</div>
				</div>
			)}

			{/* Transparent Gesture Overlay */}
			<div
				className="absolute inset-0 z-10"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onContextMenu={(e) => e.preventDefault()}
				style={{
					cursor: scrollMode ? "ns-resize" : "crosshair",
				}}
			/>
		</div>
	)
}
