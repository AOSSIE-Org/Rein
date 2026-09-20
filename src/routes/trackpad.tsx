import { BufferBar } from "@/components/Trackpad/Buffer"
import type { ModifierState } from "@/types"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState, useEffect } from "react"
import { Keyboard } from "lucide-react"
import { ControlBar } from "../components/Trackpad/ControlBar"
import { ExtraKeys } from "../components/Trackpad/ExtraKeys"
import { TouchArea } from "../components/Trackpad/TouchArea"
import { useRemoteConnection } from "../hooks/useRemoteConnection"
import { useTrackpadGesture } from "../hooks/useTrackpadGesture"
import { useMouseInput } from "../hooks/useMouseInput"
import { ScreenMirror } from "../components/Trackpad/ScreenMirror"
import { ErrorComponent } from "../components/Trackpad/ErrorComponent"
import { useWebRtcStream } from "../hooks/useWebRtcStream"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../utils/safeLocalStorage"
import { APP_CONFIG } from "../config"
import { t } from "../utils/i18n"

export const Route = createFileRoute("/trackpad")({
	component: TrackpadPage,
})

const hasOnScreenKeyboard = (): boolean => {
	if (typeof window === "undefined") return false

	if ("virtualKeyboard" in navigator) return true

	const isTouchDevice =
		"ontouchstart" in window ||
		navigator.maxTouchPoints > 0 ||
		window.matchMedia("(pointer: coarse)").matches

	if (isTouchDevice) return true

	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent,
	)
}

function legacyCopyToClipboard(text: string): void {
	const ta = document.createElement("textarea")
	ta.value = text
	ta.style.position = "fixed"
	ta.style.top = "-9999px"
	ta.style.left = "-9999px"
	ta.style.opacity = "0"
	document.body.appendChild(ta)
	ta.focus()
	ta.select()
	try {
		document.execCommand("copy")
		console.log("[Clipboard] Wrote via execCommand fallback")
	} catch (err) {
		console.error("[Clipboard] execCommand failed:", err)
	}
	document.body.removeChild(ta)
}

const MAX_CHUNK_SIZE = 8000 // ~8 KB per WebRTC message — safe everywhere

function sendTextInChunks(text: string, send: (msg: unknown) => void): void {
	// Array.from splits by Unicode code point — emojis stay intact
	const chars = Array.from(text)
	for (let i = 0; i < chars.length; i += MAX_CHUNK_SIZE) {
		const chunk = chars.slice(i, i + MAX_CHUNK_SIZE).join("")
		send({ type: "text", text: chunk })
	}
}

function TrackpadPage() {
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
	const [scrollMode, setScrollMode] = useState(false)
	const [modifier, setModifier] = useState<ModifierState>("Release")
	const [buffer, setBuffer] = useState<string[]>([])
	const bufferText = buffer.join(" + ")
	const hiddenInputRef = useRef<HTMLInputElement>(null)
	const isComposingRef = useRef(false)
	const [keyboardOpen, setKeyboardOpen] = useState(false)
	const [extraKeysVisible, setExtraKeysVisible] = useState(true)
	const [noKeyboardToast, setNoKeyboardToast] = useState(false)
	const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const { status } = useRemoteConnection()

	const [mirrorPaused, setMirrorPaused] = useState<boolean>(
		() => getLocalStorageItem("rein_mirror_paused") === "true",
	)
	const [audioMuted, setAudioMuted] = useState<boolean>(
		() => getLocalStorageItem("rein_audio_muted") === "true",
	)

	// Sync mirror/audio flags when changed in the Settings tab (same origin)
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

	const {
		trackActive,
		videoStream,
		error,
		errorHandle,
		connecting,
		reconnect,
		sendInputEvent,
		activeSessionId,
	} = useWebRtcStream({
		token,
	})

	// Send input actions safely over WebRTC DataChannels
	const broadcastMessage = (payload: unknown) => {
		sendInputEvent(payload)
	}

	const gesture = useTrackpadGesture(broadcastMessage, scrollMode)
	const { isTracking, handlers } = gesture

	const mouseInput = useMouseInput(broadcastMessage)
	const {
		isLocked: isPointerLocked,
		showLockHint,
		containerRef: mouseContainerRef,
		handlers: mouseHandlers,
	} = mouseInput

	useEffect(() => {
		if (keyboardOpen) {
			hiddenInputRef.current?.focus()
		} else {
			hiddenInputRef.current?.blur()
		}
	}, [keyboardOpen])

	const toggleKeyboard = () => {
		if (hasOnScreenKeyboard()) {
			setKeyboardOpen((prev) => {
				const next = !prev
				if (next) {
					hiddenInputRef.current?.focus()
					if ("virtualKeyboard" in navigator) {
						try {
							// @ts-expect-error
							navigator.virtualKeyboard?.show()
						} catch {}
					}
				} else {
					hiddenInputRef.current?.blur()
				}
				return next
			})
		} else {
			setNoKeyboardToast(true)
			if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
			toastTimeoutRef.current = setTimeout(() => {
				setNoKeyboardToast(false)
			}, 3000)
		}
	}

	const focusInput = () => {
		if (hasOnScreenKeyboard()) {
			hiddenInputRef.current?.focus()
		} else {
			setNoKeyboardToast(true)
			if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
			toastTimeoutRef.current = setTimeout(() => {
				setNoKeyboardToast(false)
			}, 3000)
		}
	}

	const handleClick = (button: "left" | "right") => {
		broadcastMessage({ type: "click", button, press: true })
		setTimeout(
			() => broadcastMessage({ type: "click", button, press: false }),
			50,
		)
	}

	const handleCopy = async () => {
		if (!activeSessionId) {
			console.warn("[Clipboard] No active session yet")
			return
		}
		try {
			const res = await fetch("/api/clipboard/copy", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ sessionId: activeSessionId }),
			})
			if (!res.ok) throw new Error(`Copy failed: ${res.status}`)
			const data = (await res.json()) as { text?: string }
			if (!data.text) return

			// Try modern Clipboard API first (works on HTTPS)
			if (navigator.clipboard?.writeText) {
				try {
					await navigator.clipboard.writeText(data.text)
					console.log("[Clipboard] Wrote via Clipboard API")
					return
				} catch {
					console.warn("[Clipboard] Clipboard API failed, using fallback")
				}
			}
			// Fallback for HTTP / older browsers
			legacyCopyToClipboard(data.text)
		} catch (err) {
			console.error("[Clipboard] Copy error:", err)
		}
	}

	const handlePaste = async () => {
		if (!activeSessionId) {
			console.warn("[Clipboard] No active session yet")
			return
		}
		try {
			const text = await navigator.clipboard.readText().catch(() => "")
			const res = await fetch("/api/clipboard/paste", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ sessionId: activeSessionId, text }),
			})
			if (!res.ok) throw new Error(`Paste failed: ${res.status}`)
		} catch (err) {
			console.error("[Clipboard] Paste error:", err)
		}
	}

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		console.log(
			e.target.value,
			"inputType:",
			(e.nativeEvent as InputEvent).inputType,
		)
		const nativeEvent = e.nativeEvent as InputEvent
		const inputType = nativeEvent.inputType
		const data = nativeEvent.data
		const val = e.target.value

		const resetInput = () => {
			if (hiddenInputRef.current) {
				hiddenInputRef.current.value = " "
				hiddenInputRef.current.setSelectionRange(1, 1)
			}
		}

		if (inputType === "deleteContentBackward" || val.length === 0) {
			broadcastMessage({ type: "key", key: "backspace" })
			resetInput()
			return
		}

		if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
			broadcastMessage({ type: "key", key: "enter" })
			resetInput()
			return
		}

		const textToSend = data || (val.length > 1 ? val.slice(1) : null)

		if (textToSend) {
			if (modifier !== "Release") {
				handleModifier(textToSend)
			} else {
				if (textToSend === " ") {
					broadcastMessage({ type: "key", key: "space" })
				} else {
					sendTextInChunks(textToSend, broadcastMessage)
				}
			}
			resetInput()
		}
	}

	const handleCompositionStart = () => {
		isComposingRef.current = true
	}

	const handleCompositionEnd = (
		e: React.CompositionEvent<HTMLInputElement>,
	) => {
		isComposingRef.current = false
		const val = (e.target as HTMLInputElement).value
		const textToSend = val.startsWith(" ") ? val.slice(1) : val

		if (textToSend) {
			if (modifier !== "Release") {
				handleModifier(textToSend)
			} else {
				sendTextInChunks(textToSend, broadcastMessage)
			}
		}

		if (hiddenInputRef.current) {
			hiddenInputRef.current.value = " "
			hiddenInputRef.current.setSelectionRange(1, 1)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const key = e.key.toLowerCase()

		if (key === "enter") {
			broadcastMessage({ type: "key", key: "enter" })
			if (hiddenInputRef.current) hiddenInputRef.current.value = " "
			return
		}

		if (modifier !== "Release") {
			if (key === "escape") {
				e.preventDefault()
				setModifier("Release")
				setBuffer([])
				return
			}
			if (key.length > 1 && key !== "unidentified" && key !== "backspace") {
				e.preventDefault()
				handleModifier(key)
				return
			}
		}

		if (
			key.length > 1 &&
			key !== "unidentified" &&
			key !== "backspace" &&
			key !== "process"
		) {
			broadcastMessage({ type: "key", key })
		}
	}

	const handleModifierState = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) setModifier("Hold")
				else setModifier("Release")
				break
			case "Hold":
				setModifier("Release")
				setBuffer([])
				break
			case "Release":
				setModifier("Active")
				setBuffer([])
				break
		}
	}

	const handleModifier = (key: string) => {
		if (modifier === "Hold") {
			const comboKeys = [...buffer, key]
			sendInputEvent({ type: "combo", keys: comboKeys })
			setBuffer([])
		} else if (modifier === "Active") {
			setBuffer((prev) => [...prev, key])
		}
	}

	return (
		<div className="flex flex-col h-full min-h-0 bg-base-300 overflow-hidden">
			{/* Main content row: on large screens, trackpad/screen sits left and right panel sits right */}
			<div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
				{/* Left/top: screen mirror only (no control bar on desktop) */}
				<div className="flex flex-col flex-1 min-h-0 min-w-0">
					<div className="flex-1 min-h-0 relative flex flex-col border-b border-base-200">
						<TouchArea
							isTracking={isTracking}
							scrollMode={scrollMode}
							handlers={handlers}
						/>
						{error && errorHandle ? (
							<ErrorComponent
								error={error}
								errorHandle={errorHandle}
								onReconnect={reconnect}
							/>
						) : (
							<ScreenMirror
								isTracking={isTracking}
								scrollMode={scrollMode}
								handlers={handlers}
								videoStream={videoStream}
								trackActive={trackActive}
								connecting={connecting}
								status={status}
								mouseContainerRef={mouseContainerRef}
								onMouseClick={mouseHandlers.onClick}
								isPointerLocked={isPointerLocked}
								showLockHint={showLockHint}
								paused={mirrorPaused}
								muted={audioMuted}
							/>
						)}
						{bufferText !== "" && <BufferBar bufferText={bufferText} />}
					</div>

					{/* Mobile-only: ControlBar below the screen */}
					<div className="lg:hidden shrink-0 border-b border-base-200">
						<ControlBar
							onCopy={handleCopy}
							onPaste={handlePaste}
							scrollMode={scrollMode}
							modifier={modifier}
							buffer={buffer.join(" + ")}
							keyboardOpen={keyboardOpen}
							extraKeysVisible={extraKeysVisible}
							onToggleScroll={() => setScrollMode(!scrollMode)}
							onLeftClick={() => handleClick("left")}
							onRightClick={() => handleClick("right")}
							onKeyboardToggle={toggleKeyboard}
							onModifierToggle={handleModifierState}
							onExtraKeysToggle={() => setExtraKeysVisible((prev) => !prev)}
						/>
					</div>

					{/* Mobile-only: ExtraKeys below the control bar */}
					<div
						className={`lg:hidden shrink-0 overflow-hidden transition-all duration-300 ${
							!extraKeysVisible || keyboardOpen
								? "max-h-0 opacity-0 pointer-events-none"
								: "max-h-[50vh] opacity-100"
						}`}
					>
						<ExtraKeys
							orientation="horizontal"
							sendKey={(k) => {
								if (modifier !== "Release") handleModifier(k)
								else broadcastMessage({ type: "key", key: k })
							}}
							onInputFocus={focusInput}
						/>
					</div>
				</div>
				{/* Desktop/Tablet mode: right side panel */}
				<div className="hidden min-w-56 lg:flex lg:flex-col h-full shrink-0 border-l border-base-200 overflow-y-auto">
					<div className="flex flex-1 flex-col w-full h-full p-3 bg-base-100">
						<div className="flex flex-col gap-4">
							<ControlBar
								orientation="vertical"
								onCopy={handleCopy}
								onPaste={handlePaste}
								scrollMode={scrollMode}
								modifier={modifier}
								buffer={buffer.join(" + ")}
								keyboardOpen={keyboardOpen}
								extraKeysVisible={extraKeysVisible}
								onToggleScroll={() => setScrollMode(!scrollMode)}
								onLeftClick={() => handleClick("left")}
								onRightClick={() => handleClick("right")}
								onKeyboardToggle={toggleKeyboard}
								onModifierToggle={handleModifierState}
								onExtraKeysToggle={() => setExtraKeysVisible((prev) => !prev)}
							/>
							<ExtraKeys
								orientation="vertical"
								sendKey={(k) => {
									if (modifier !== "Release") handleModifier(k)
									else broadcastMessage({ type: "key", key: k })
								}}
								onInputFocus={focusInput}
							/>
						</div>
						<div className="mt-auto flex flex-col items-center gap-1 pt-6 pb-2">
							<span className="text-sm font-semibold text-base-content/90">
								Rein
							</span>
							<span className="text-xs text-base-content/50">
								v{APP_CONFIG.VERSION}
							</span>
						</div>
					</div>
				</div>
			</div>

			{noKeyboardToast && (
				<div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-base-100/95 backdrop-blur-md px-4 py-2.5 rounded-full border border-base-300 shadow-2xl text-xs md:text-sm text-base-content pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-3">
					<Keyboard size={16} className="text-warning shrink-0" />
					<span className="font-medium">
						{t("settings", "noOnscreenKeyboard")}
					</span>
				</div>
			)}

			<input
				ref={hiddenInputRef}
				className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
				defaultValue=" "
				onKeyDown={handleKeyDown}
				onChange={handleInput}
				onCompositionStart={handleCompositionStart}
				onCompositionEnd={handleCompositionEnd}
				onBlur={() => {
					if (keyboardOpen) {
						setTimeout(() => hiddenInputRef.current?.focus(), 10)
					}
				}}
				autoComplete="off"
				autoCorrect="off"
				autoCapitalize="off"
				spellCheck={false}
				inputMode="text"
				enterKeyHint="enter"
			/>
		</div>
	)
}
