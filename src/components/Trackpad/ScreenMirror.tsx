"use client"

import type React from "react"
import { useEffect, useRef } from "react"

interface ScreenMirrorProps {
	scrollMode: boolean
	isTracking: boolean
	handlers: React.HTMLAttributes<HTMLDivElement>
	videoStream: MediaStream | null
	trackActive: boolean
}

const TEXTS = {
	WAITING: "Connecting to host desktop...",
	AUTOMATIC: "Establishing secure connection",
}

export const ScreenMirror = ({
	scrollMode,
	isTracking,
	handlers,
	videoStream,
	trackActive,
}: ScreenMirrorProps) => {
	const videoElementRef = useRef<HTMLVideoElement | null>(null)
	useEffect(() => {
		const video = videoElementRef.current
		if (!video) return
		video.srcObject = videoStream
		if (videoStream) {
			video.play().catch(() => {})
		}
		return () => {
			video.srcObject = null
		}
	}, [videoStream])

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none touch-none">
			{/* Hardware Accelerated Video Renderer */}
			<video
				ref={videoElementRef}
				aria-label="Remote desktop screen share"
				autoPlay
				playsInline
				muted
				controls={false}
				className={`w-full h-full object-contain transition-opacity duration-500 ${
					trackActive ? "opacity-100" : "opacity-0"
				}`}
			/>

			{/* Standby Loading UI */}
			{!trackActive && (
				<div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4 bg-base-300">
					<div className="loading loading-spinner loading-lg text-primary" />
					<div className="text-center px-6">
						<p className="font-semibold text-lg">{TEXTS.WAITING}</p>
						<p className="text-sm opacity-60">{TEXTS.AUTOMATIC}</p>
					</div>
				</div>
			)}

			{/* Gesture Event Interaction Overlay */}
			<div
				className="absolute inset-0 z-10"
				{...handlers}
				style={{
					cursor: scrollMode ? "ns-resize" : isTracking ? "none" : "default",
				}}
			/>
		</div>
	)
}
