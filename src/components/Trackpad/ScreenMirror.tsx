"use client"

import type React from "react"
import { useRef } from "react"
import { useWebRTCConsumer } from "../../hooks/useWebRTCConsumer"

const EMPTY_CAPTIONS_TRACK = "data:text/vtt;charset=utf-8,WEBVTT"

interface ScreenMirrorProps {
	scrollMode: boolean
	isTracking: boolean
	handlers: React.HTMLAttributes<HTMLDivElement>
}

const TEXTS = {
	WAITING: "Waiting for screen...",
	AUTOMATIC: "Mirroring will start automatically",
}

export const ScreenMirror = ({
	scrollMode,
	isTracking,
	handlers,
}: ScreenMirrorProps) => {
	const videoRef = useRef<HTMLVideoElement>(null)
	const { hasStream } = useWebRTCConsumer(videoRef)

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none touch-none">
			{/* Mirror Video — WebRTC stream rendered natively */}
			<video
				ref={videoRef}
				autoPlay
				playsInline
				className={`w-full h-full object-contain transition-opacity duration-500 ${
					hasStream ? "opacity-100" : "opacity-0"
				}`}
			>
				<track
					default
					kind="captions"
					label="No audio"
					src={EMPTY_CAPTIONS_TRACK}
					srcLang="en"
				/>
			</video>

			{/* Standby UI */}
			{!hasStream && (
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
				{...handlers}
				style={{
					cursor: scrollMode ? "ns-resize" : isTracking ? "none" : "default",
				}}
			/>
		</div>
	)
}
