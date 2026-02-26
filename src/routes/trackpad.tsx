import { BufferBar } from "@/components/Trackpad/Buffer"
import type { ModifierState } from "@/types"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { ControlBar } from "../components/Trackpad/ControlBar"
import { ExtraKeys } from "../components/Trackpad/ExtraKeys"
import { TouchArea } from "../components/Trackpad/TouchArea"
import { useRemoteConnection } from "../hooks/useRemoteConnection"
import { useTrackpadGesture } from "../hooks/useTrackpadGesture"

export const Route = createFileRoute("/trackpad")({
	component: TrackpadPage,
})

function TrackpadPage() {
	const [scrollMode, setScrollMode] = useState(false)
	const [modifier, setModifier] = useState<ModifierState>("Release")
	const [buffer, setBuffer] = useState<string[]>([])
	const bufferText = buffer.join(" + ")
	const hiddenInputRef = useRef<HTMLInputElement>(null)

	// Load Client Settings
	const [sensitivity] = useState(() => {
		if (typeof window === "undefined") return 1.0
		const s = localStorage.getItem("rein_sensitivity")
		return s ? Number.parseFloat(s) : 1.0
	})

	const [invertScroll] = useState(() => {
		if (typeof window === "undefined") return false
		const s = localStorage.getItem("rein_invert")
		return s ? JSON.parse(s) : false
	})

	const { status, send, sendCombo } = useRemoteConnection()
	// Pass sensitivity and invertScroll to the gesture hook
	const { isTracking, handlers } = useTrackpadGesture(
		send,
		scrollMode,
		sensitivity,
		invertScroll,
	)

	const focusInput = () => {
		hiddenInputRef.current?.focus()
	}

	const handleClick = (button: "left" | "right") => {
		send({ type: "click", button, press: true })
		// Release after short delay to simulate click
		setTimeout(() => send({ type: "click", button, press: false }), 50)
	}

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const nativeEvent = e.nativeEvent as InputEvent
		const inputType = nativeEvent.inputType
		const data = nativeEvent.data
		const val = e.target.value

		// Synchronous Reset: Reset the input immediately to prevent buffer accumulation
		const resetInput = () => {
			if (hiddenInputRef.current) {
				hiddenInputRef.current.value = " "
				hiddenInputRef.current.setSelectionRange(1, 1)
			}
		}

		// 1. Explicit Backspace Detection
		if (inputType === "deleteContentBackward" || val.length === 0) {
			send({ type: "key", key: "backspace" })
			resetInput()
			return
		}

		// 2. Explicit New Line / Enter
		if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
			send({ type: "key", key: "enter" })
			resetInput()
			return
		}

		// 3. Handle Text Insertion
		const textToSend = data || (val.length > 1 ? val.slice(1) : null)

		if (textToSend) {
			if (modifier !== "Release") {
				handleModifier(textToSend)
			} else {
				// Map space character to the 'space' key command specifically
				if (textToSend === " ") {
					send({ type: "key", key: "space" })
				} else {
					send({ type: "text", text: textToSend })
				}
			}
		}

		resetInput()
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const key = e.key.toLowerCase()

		// 1. Enter key fallback
		if (key === "enter") {
			send({ type: "key", key: "enter" })
			if (hiddenInputRef.current) {
				hiddenInputRef.current.value = " "
			}
			return
		}

		// 2. Modifier Logic
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

		// 3. Special keys (Arrows, Tab, etc.)
		if (
			key.length > 1 &&
			key !== "unidentified" &&
			key !== "backspace" &&
			key !== "process"
		) {
			send({ type: "key", key })
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

	const handleContainerClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			e.preventDefault()
			focusInput()
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Layout container delegates focus to hidden input, not an interactive element
		<div
			className="flex flex-col h-full overflow-hidden"
			onClick={handleContainerClick}
		>
			{/* Touch Surface */}
			<TouchArea
				isTracking={isTracking}
				scrollMode={scrollMode}
				handlers={handlers}
				status={status}
			/>
			{bufferText !== "" && <BufferBar bufferText={bufferText} />}

			{/* Controls */}
			<ControlBar
				scrollMode={scrollMode}
				modifier={modifier}
				buffer={buffer.join(" + ")}
				onToggleScroll={() => setScrollMode(!scrollMode)}
				onLeftClick={() => handleClick("left")}
				onRightClick={() => handleClick("right")}
				onKeyboardToggle={focusInput}
				onModifierToggle={handleModifierState}
			/>

			{/* Extra Keys */}
			<ExtraKeys
				sendKey={(k) => {
					if (modifier !== "Release") handleModifier(k)
					else send({ type: "key", key: k })
				}}
				onInputFocus={focusInput}
			/>

			{/* Hidden Input for Mobile Keyboard */}
			<input
				ref={hiddenInputRef}
				className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
				defaultValue=" "
				onKeyDown={handleKeyDown}
				onChange={handleInput}
				onBlur={() => {
					setTimeout(() => hiddenInputRef.current?.focus(), 10)
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
