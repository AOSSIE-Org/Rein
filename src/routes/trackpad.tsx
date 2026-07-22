import { BufferBar } from "@/components/Trackpad/Buffer"
import type { ModifierState } from "@/types"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState, useEffect } from "react"
import { ControlBar } from "../components/Trackpad/ControlBar"
import { ExtraKeys } from "../components/Trackpad/ExtraKeys"
import { TouchArea } from "../components/Trackpad/TouchArea"
import { useRemoteConnection } from "../hooks/useRemoteConnection"
import { useTrackpadGesture } from "../hooks/useTrackpadGesture"
import { ScreenMirror } from "../components/Trackpad/ScreenMirror"
import { ErrorComponent } from "../components/Trackpad/ErrorComponent"
import { useWebRtcStream } from "../hooks/useWebRtcStream"

const copyWithFallback = (text: string) => {
	const textArea = document.createElement("textarea")
	textArea.value = text
	textArea.setAttribute("readonly", "")
	textArea.style.position = "absolute"
	textArea.style.left = "-9999px"
	document.body.appendChild(textArea)
	textArea.select()
	textArea.setSelectionRange(0, text.length)
	try {
		return document.execCommand("copy")
	} finally {
		document.body.removeChild(textArea)
	}
}
const writeClientClipboard = async (text: string) => {
	if (
		typeof navigator !== "undefined" &&
		navigator.clipboard &&
		typeof navigator.clipboard.writeText === "function"
	) {
		try {
			await navigator.clipboard.writeText(text)
			return
		} catch (err) {
			console.warn("navigator.clipboard.writeText failed, using fallback:", err)
		}
	}
	const success = copyWithFallback(text)
	if (!success) {
		throw new Error("Fallback copy failed")
	}
}

export const Route = createFileRoute("/trackpad")({
	component: TrackpadPage,
})

function TrackpadPage() {
	const searchParams = new URLSearchParams(
		typeof window !== "undefined" ? window.location.search : "",
	)

	// Scan standard URL parameter fields to locate token strings passed from settings QR codes
	const urlToken = searchParams.get("token")
	const token =
		urlToken ||
		(typeof window !== "undefined"
			? localStorage.getItem("rein_auth_token")
			: null)

	// Save token internally if extracted directly from the URL scan pass
	useEffect(() => {
		if (urlToken) {
			localStorage.setItem("rein_auth_token", urlToken)
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
	const { status, send, sendCombo } = useRemoteConnection()
	const {
		trackActive,
		videoStream,
		error,
		errorHandle,
		reconnect,
		activeSessionId,
	} = useWebRtcStream({
		token,
	})

	// Send input actions safely over WebRTC DataChannels
	const broadcastMessage = (payload: unknown) => {
		send(payload)
	}

	const gesture = useTrackpadGesture(broadcastMessage, scrollMode)
	const { isTracking, handlers } = gesture

	useEffect(() => {
		if (keyboardOpen) {
			hiddenInputRef.current?.focus()
		} else {
			hiddenInputRef.current?.blur()
		}
	}, [keyboardOpen])

	const toggleKeyboard = () => setKeyboardOpen((prev) => !prev)
	const focusInput = () => hiddenInputRef.current?.focus()

	const handleClick = (button: "left" | "right") => {
		broadcastMessage({ type: "click", button, press: true })
		setTimeout(
			() => broadcastMessage({ type: "click", button, press: false }),
			50,
		)
	}

	const handleCopy = async () => {
		try {
			const headers: Record<string, string> = {}
			if (token) {
				headers.Authorization = `Bearer ${token}`
			}
			const response = await fetch("/api/clipboard/copy", {
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ sessionId: activeSessionId }),
			})
			if (response.ok) {
				const data = await response.json()
				if (data && typeof data.text === "string") {
					await writeClientClipboard(data.text)
				} else {
					throw new Error("Invalid copy response data")
				}
			} else {
				throw new Error(`Clipboard copy failed: ${response.statusText}`)
			}
		} catch (err) {
			console.warn(
				"Client clipboard copy failed, falling back to server copy:",
				err,
			)
			broadcastMessage({ type: "copy" })
		}
	}
	const handlePaste = async () => {
		try {
			if (
				typeof navigator !== "undefined" &&
				navigator.clipboard &&
				typeof navigator.clipboard.readText === "function"
			) {
				const text = await navigator.clipboard.readText()
				if (text) {
					const headers: Record<string, string> = {}
					if (token) {
						headers.Authorization = `Bearer ${token}`
					}
					const response = await fetch("/api/clipboard/paste", {
						method: "POST",
						headers: {
							...headers,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ sessionId: activeSessionId, text }),
					})
					if (response.ok) {
						return
					}
				}
			}
			throw new Error("Client clipboard read returned empty or is unavailable")
		} catch (err) {
			console.warn(
				"Client clipboard paste failed, falling back to server clipboard:",
				err,
			)
			broadcastMessage({ type: "paste" })
		}
	}

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
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
					broadcastMessage({ type: "text", text: textToSend })
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
				broadcastMessage({ type: "text", text: textToSend })
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
			sendCombo(comboKeys)
		} else if (modifier === "Active") {
			setBuffer((prev) => [...prev, key])
		}
	}

	return (
		<div className="flex flex-col h-full min-h-0 bg-base-300 overflow-hidden">
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
						status={status}
					/>
				)}
				{bufferText !== "" && <BufferBar bufferText={bufferText} />}
			</div>

			<div className="shrink-0 border-b border-base-200">
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

			<div
				className={`shrink-0 overflow-hidden transition-all duration-300 ${
					!extraKeysVisible || keyboardOpen
						? "max-h-0 opacity-0 pointer-events-none"
						: "max-h-[50vh] opacity-100"
				}`}
			>
				<ExtraKeys
					sendKey={(k) => {
						if (modifier !== "Release") handleModifier(k)
						else broadcastMessage({ type: "key", key: k })
					}}
					onInputFocus={focusInput}
				/>
			</div>

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
