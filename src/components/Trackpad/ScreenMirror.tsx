"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Lock, Maximize, Minimize, ScreenShareOff } from "lucide-react"

import { t } from "../../utils/i18n"

declare global {
	interface Document {
		webkitFullscreenElement?: Element
		webkitExitFullscreen?: () => Promise<void>
	}
	interface HTMLElement {
		webkitRequestFullscreen?: () => Promise<void>
	}
}

interface ScreenMirrorProps {
	scrollMode: boolean
	isTracking: boolean
	handlers: React.HTMLAttributes<HTMLDivElement>
	videoStream: MediaStream | null
	trackActive: boolean
	connecting: boolean
	status: "connecting" | "connected" | "disconnected"
	mouseContainerRef?: React.RefObject<HTMLDivElement | null>
	onMouseClick?: (e: React.MouseEvent) => void
	isPointerLocked?: boolean
	showLockHint?: boolean
	disableFullscreen?: boolean
	paused?: boolean
	muted?: boolean
}

const TEXTS = {
	get AUTOMATIC() {
		return t("screenMirror", "establishingSecure")
	},
}

export const ScreenMirror = ({
	scrollMode,
	isTracking,
	handlers,
	videoStream,
	trackActive,
	connecting,
	status,
	mouseContainerRef,
	onMouseClick,
	isPointerLocked,
	showLockHint,
	disableFullscreen = false,
	paused = false,
	muted: audioMuted = false,
}: ScreenMirrorProps) => {
	const videoElementRef = useRef<HTMLVideoElement | null>(null)
	const [isFullscreen, setIsFullscreen] = useState(false)

	useEffect(() => {
		const video = videoElementRef.current
		if (!video) return

		if (video.srcObject !== videoStream) {
			video.srcObject = videoStream
		}

		if (videoStream && videoStream.getTracks().length > 0) {
			video.muted = audioMuted
			video.play().catch((err) => {
				if (err.name === "AbortError") return
				if (!audioMuted) {
					// Unmuted autoplay was blocked — retry muted as a fallback.
					console.log(
						"[ScreenMirror] Unmuted autoplay blocked, retrying muted (expected behavior):",
						err.message,
					)
				}
				if (video) {
					video.muted = true
					video.play().catch((e) => {
						if (e.name !== "AbortError") {
							console.error("[ScreenMirror] Muted autoplay failed:", e)
						}
					})
				}
			})
		}
		return () => {
			if (!videoStream && video) {
				video.srcObject = null
			}
		}
	}, [videoStream, audioMuted])

	useEffect(() => {
		const video = videoElementRef.current
		if (!video) return
		video.muted = audioMuted
	}, [audioMuted])

	const handleInteraction = () => {
		const video = videoElementRef.current
		if (video?.muted && !audioMuted) {
			console.log("[ScreenMirror] User interaction detected, unmuting audio.")
			video.muted = false
			if (video.paused) {
				video.play().catch((err) => {
					if (err.name !== "AbortError") {
						console.error("[ScreenMirror] Failed to play after unmuting:", err)
					}
				})
			}
		}
	}

	const handleFullscreenToggle = (e: React.MouseEvent) => {
		e.stopPropagation()
		const container =
			mouseContainerRef?.current || videoElementRef.current?.parentElement
		if (!container) return

		const isFull = !!(
			document.fullscreenElement || document.webkitFullscreenElement
		)

		if (!isFull) {
			if (container.requestFullscreen) {
				container.requestFullscreen().catch((err) => {
					console.warn("[ScreenMirror] Fullscreen request failed:", err)
				})
			} else if (container.webkitRequestFullscreen) {
				container.webkitRequestFullscreen()
			}
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen().catch((err) => {
					console.warn("[ScreenMirror] Exit fullscreen failed:", err)
				})
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen().catch((err) => {
					console.warn("[ScreenMirror] WebKit exit fullscreen failed:", err)
				})
			}
		}
	}

	useEffect(() => {
		const handleFullscreenChange = () => {
			setIsFullscreen(
				!!(document.fullscreenElement || document.webkitFullscreenElement),
			)
		}
		document.addEventListener("fullscreenchange", handleFullscreenChange)
		document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
		return () => {
			document.removeEventListener("fullscreenchange", handleFullscreenChange)
			document.removeEventListener(
				"webkitfullscreenchange",
				handleFullscreenChange,
			)
		}
	}, [])

	const getWaitingText = () => {
		if (connecting) return t("screenMirror", "establishingConnection")
		switch (status) {
			case "disconnected":
				return t("screenMirror", "disconnected")
			case "connected":
				return t("screenMirror", "connectedButNoVideo")
			default:
				return t("screenMirror", "connecting")
		}
	}

	const getSubText = () => {
		if (connecting) return t("screenMirror", "negotiatingWebRtc")
		switch (status) {
			case "disconnected":
				return t("screenMirror", "checkNetwork")
			case "connected":
				return t("screenMirror", "settingUpScreen")
			default:
				return TEXTS.AUTOMATIC
		}
	}

	return (
		<section
			role="application"
			ref={mouseContainerRef}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: mouse container receives focus for physical keyboard shortcuts
			tabIndex={0}
			aria-label={t("screenMirror", "ariaLabel")}
			onPointerDown={handleInteraction}
			onTouchStart={handleInteraction}
			onClick={onMouseClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					handleInteraction()
				}
			}}
			className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none touch-none focus:outline-none focus:ring-2 focus:ring-primary"
		>
			{/* biome-ignore lint/a11y/useMediaCaption: screen mirror stream does not contain timed text track */}
			<video
				ref={videoElementRef}
				aria-label={t("screenMirror", "ariaLabel")}
				autoPlay
				playsInline
				controls={false}
				className={`w-full h-full object-contain transition-opacity duration-500 ${
					trackActive ? "opacity-100" : "opacity-0"
				}`}
				id="screenMirror"
			/>

			{/* Standby Loading UI */}
			{!trackActive && (
				<div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4 bg-base-300">
					<div className="loading loading-spinner loading-lg text-primary" />
					<div className="text-center px-6">
						<p className="font-semibold text-lg">{getWaitingText()}</p>
						<p className="text-sm opacity-60">{getSubText()}</p>
					</div>
				</div>
			)}
			{paused && trackActive && (
				<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-base-200 transition-opacity duration-300">
					<span className="text-base-content">
						<ScreenShareOff className="size-12" />
					</span>
					<p className="text-sm font-medium text-base-content/40 select-none">
						{t("screenMirror", "disabled")}
					</p>
				</div>
			)}
			{/* Mouse Lock Notification Popup */}
			{isPointerLocked && showLockHint && (
				<div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-base-100/90 backdrop-blur-md px-4 py-2 rounded-full border border-base-300 shadow-xl text-xs md:text-sm text-base-content pointer-events-none transition-all duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
					<Lock size={14} className="text-primary shrink-0" />
					<span>{t("screenMirror", "mouseLockedHint", { key: "Esc" })}</span>
				</div>
			)}

			{/* Toggleable Fullscreen Button in Lower Right Corner */}
			{!disableFullscreen && (
				<button
					type="button"
					onClick={handleFullscreenToggle}
					onPointerDown={(e) => e.stopPropagation()}
					onTouchStart={(e) => e.stopPropagation()}
					className="absolute bottom-4 right-4 z-30 flex items-center justify-center w-10 h-10 bg-base-100/80 hover:bg-base-100 active:scale-95 text-base-content backdrop-blur-md border border-base-300 shadow-xl rounded-full transition-all duration-200"
					aria-label={
						isFullscreen
							? t("screenMirror", "exitFullscreen")
							: t("screenMirror", "enterFullscreen")
					}
					title={
						isFullscreen
							? t("screenMirror", "exitFullscreen")
							: t("screenMirror", "enterFullscreen")
					}
				>
					{isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
				</button>
			)}

			{/* Gesture Event Interaction Overlay */}
			{/* onClickCapture stops synthesized mouse-click events (generated by the
			    browser ~300 ms after a touch tap) from bubbling up to the section's
			    onMouseClick handler, which would otherwise trigger pointer-lock on mobile. */}
			<div
				className="absolute inset-0 z-10"
				{...handlers}
				onClickCapture={(e) => e.stopPropagation()}
				style={{
					cursor: scrollMode
						? "ns-resize"
						: isTracking || isPointerLocked
							? "none"
							: "pointer",
				}}
			/>
		</section>
	)
}
