import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect, useRef } from "react"
import { Maximize, Minimize } from "lucide-react"
import { useRemoteConnection } from "../hooks/useRemoteConnection"
import { useWebRtcStream } from "../hooks/useWebRtcStream"
import { ScreenMirror } from "../components/Trackpad/ScreenMirror"
import { ErrorComponent } from "../components/Trackpad/ErrorComponent"
import { GamepadOverlay } from "../components/Gamepad/GamepadOverlay"
import { useGamepadLayout } from "../components/Gamepad/GamepadLayoutSettings"
import type { GamepadButtonId } from "../components/Gamepad/GamepadOverlay"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../utils/safeLocalStorage"
import { t } from "../utils/i18n"

export const Route = createFileRoute("/gamepad")({
	component: GamepadPage,
})

function GamepadPage() {
	const searchParams = new URLSearchParams(
		typeof window !== "undefined" ? window.location.search : "",
	)

	// Scan standard URL parameter fields to locate token strings passed from settings QR codes
	const urlToken = searchParams.get("token")
	const token = urlToken || getLocalStorageItem("rein_auth_token")

	// Save token internally if extracted directly from the URL scan pass
	useEffect(() => {
		if (urlToken) {
			setLocalStorageItem("rein_auth_token", urlToken)
		}
	}, [urlToken])

	const { status, send } = useRemoteConnection()
	const {
		trackActive,
		videoStream,
		error,
		errorHandle,
		connecting,
		reconnect,
	} = useWebRtcStream({ token })

	const [mirrorPaused, setMirrorPaused] = useState<boolean>(
		() => getLocalStorageItem("rein_mirror_paused") === "true",
	)
	const [audioMuted, setAudioMuted] = useState<boolean>(
		() => getLocalStorageItem("rein_audio_muted") === "true",
	)

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === "rein_mirror_paused") {
				setMirrorPaused(e.newValue === "true")
			}
			if (e.key === "rein_audio_muted") {
				setAudioMuted(e.newValue === "true")
			}
		}
		window.addEventListener("storage", onStorage)
		return () => window.removeEventListener("storage", onStorage)
	}, [])

	const [layout] = useGamepadLayout()

	// Track which digital buttons are currently held down
	const [activeButtons, setActiveButtons] = useState<Set<GamepadButtonId>>(
		new Set(),
	)
	const activeButtonsRef = useRef<Set<GamepadButtonId>>(activeButtons)
	useEffect(() => {
		activeButtonsRef.current = activeButtons
	}, [activeButtons])

	useEffect(() => {
		return () => {
			for (const id of activeButtonsRef.current) {
				send({ type: "gamepad", button: id, press: false })
			}
			send({ type: "gamepad-axis", axis: "ls", ax: 0, ay: 0 })
			send({ type: "gamepad-axis", axis: "rs", ax: 0, ay: 0 })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [send])

	const containerRef = useRef<HTMLDivElement | null>(null)
	const [isFullscreen, setIsFullscreen] = useState(false)

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

	const handleFullscreenToggle = (e: React.MouseEvent) => {
		e.stopPropagation()
		const container = containerRef.current
		if (!container) return

		const isFull = !!(
			document.fullscreenElement || document.webkitFullscreenElement
		)

		if (!isFull) {
			if (container.requestFullscreen) {
				container.requestFullscreen().catch((err) => {
					console.warn("[Gamepad] Fullscreen request failed:", err)
				})
			} else if (container.webkitRequestFullscreen) {
				container.webkitRequestFullscreen()
			}
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen().catch((err) => {
					console.warn("[Gamepad] Exit fullscreen failed:", err)
				})
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen().catch((err) => {
					console.warn("[Gamepad] WebKit exit fullscreen failed:", err)
				})
			}
		}
	}

	// Digital button press / release — sent over the ordered data-channel
	const handleButtonChange = (id: GamepadButtonId, pressed: boolean) => {
		setActiveButtons((prev) => {
			const next = new Set(prev)
			if (pressed) next.add(id)
			else next.delete(id)
			return next
		})
		send({ type: "gamepad", button: id, press: pressed })
	}

	// Analog stick axis update — sent over the unordered data-channel (high-frequency motion).
	// The ConnectionProvider.send() automatically routes "gamepad-axis" type through
	// unordered because we extend the isUnordered check below via the custom type.
	const handleAxisChange = (axis: "ls" | "rs", ax: number, ay: number) => {
		// Use the raw send from useRemoteConnection; ConnectionProvider routes
		// "gamepad-axis" as unordered because we must add it to that list.
		send({ type: "gamepad-axis", axis, ax, ay })
	}

	return (
		// Full-width horizontal layout — gamepad is always used landscape
		<div
			ref={containerRef}
			className="flex h-full min-h-0 w-full bg-black overflow-hidden relative"
		>
			<div className="relative flex-1 min-w-0 min-h-0">
				{error && errorHandle ? (
					<ErrorComponent
						error={error}
						errorHandle={errorHandle}
						onReconnect={reconnect}
					/>
				) : (
					<ScreenMirror
						isTracking={false}
						scrollMode={false}
						handlers={{}}
						videoStream={videoStream}
						trackActive={trackActive}
						connecting={connecting}
						status={status}
						disableFullscreen={true}
						paused={mirrorPaused}
						muted={audioMuted}
					/>
				)}

				{/* Xbox-layout gamepad buttons overlay */}
				{!error && (
					<GamepadOverlay
						layout={layout}
						activeButtons={activeButtons}
						onButtonChange={handleButtonChange}
						onAxisChange={handleAxisChange}
					/>
				)}

				{/* Toggleable Fullscreen Button for the entire gamepad UI */}
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
			</div>
		</div>
	)
}
