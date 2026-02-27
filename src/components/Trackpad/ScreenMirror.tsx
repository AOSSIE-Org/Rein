import { useEffect, useRef } from "react"
import { useConnection } from "../../contexts/ConnectionProvider"
import { useWebRTCConsumer } from "../../hooks/useWebRTCConsumer"
import { useWebRTC } from "../../hooks/useWebRTCProvider"

interface ScreenMirrorProps {
	scrollMode: boolean
	isTracking: boolean
	handlers: {
		onTouchStart: (e: React.TouchEvent) => void
		onTouchMove: (e: React.TouchEvent) => void
		onTouchEnd: (e: React.TouchEvent) => void
	}
}

export const ScreenMirror: React.FC<ScreenMirrorProps> = ({
	scrollMode,
	isTracking,
	handlers,
}) => {
	const videoRef = useRef<HTMLVideoElement>(null)
	const { status } = useConnection()
	const { localStream } = useWebRTC()
	const { remoteStream } = useWebRTCConsumer(!localStream)

	const activeStream = localStream || remoteStream

	// Update video element when active stream arrives
	useEffect(() => {
		if (videoRef.current && activeStream) {
			videoRef.current.srcObject = activeStream
		}
	}, [activeStream])

	const handlePreventFocus = (e: React.MouseEvent) => {
		e.preventDefault()
	}

	return (
		<div
			className="flex-1 bg-neutral-900 relative touch-none select-none flex items-center justify-center overflow-hidden"
			onTouchStart={handlers.onTouchStart}
			onTouchMove={handlers.onTouchMove}
			onTouchEnd={handlers.onTouchEnd}
			onMouseDown={handlePreventFocus}
		>
			{/* Status indicator bar */}
			<div
				className={`absolute top-0 left-0 w-full h-1 z-20 ${
					status === "connected" ? "bg-success" : "bg-error"
				}`}
			/>

			{/* Mirror Video (WebRTC) */}
			{activeStream ? (
				<video
					ref={videoRef}
					autoPlay
					playsInline
					muted
					className="absolute w-full h-full object-contain pointer-events-none"
				/>
			) : (
				<div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-neutral-900/40 backdrop-blur-[2px] pointer-events-none px-6">
					<div className="text-neutral-500 text-center pointer-events-none">
						<div className="text-2xl mb-4 opacity-40">
							{status === "connected" ? "Mirror Standby" : "Connecting..."}
						</div>

						{status === "connected" && (
							<div className="bg-primary/10 text-primary text-xs p-4 rounded-2xl border border-primary/20 mb-6 max-w-xs mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700 backdrop-blur-sm pointer-events-auto">
								Waiting for Desktop stream...
							</div>
						)}

						{status !== "connected" && (
							<div className="loading loading-ring loading-lg opacity-20 mt-4" />
						)}
					</div>
				</div>
			)}

			{/* Scroll mode badge */}
			{scrollMode && (
				<div className="absolute top-4 right-4 badge badge-info z-10">
					SCROLL Active
				</div>
			)}

			{/* Tracking indicator */}
			{isTracking && activeStream && (
				<div className="absolute bottom-4 right-4 z-10">
					<div className="loading loading-ring loading-sm text-primary" />
				</div>
			)}
		</div>
	)
}
