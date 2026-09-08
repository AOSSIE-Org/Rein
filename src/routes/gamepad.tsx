import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
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

	const [layout] = useGamepadLayout()

	// Track which digital buttons are currently held down
	const [activeButtons, setActiveButtons] = useState<Set<GamepadButtonId>>(
		new Set(),
	)

	// Digital button press / release — sent over the ordered data-channel
	const handleButtonChange = (id: GamepadButtonId, pressed: boolean) => {
		setActiveButtons((prev) => {
			const next = new Set(prev)
			if (pressed) next.add(id)
			else next.delete(id)
			return next
		})
		send({ type: "gamepad", button: id, pressed })
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
		<div className="flex h-full min-h-0 w-full bg-black overflow-hidden">
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
			</div>
		</div>
	)
}
