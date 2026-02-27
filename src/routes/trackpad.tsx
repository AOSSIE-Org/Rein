import { BufferBar } from "@/components/Trackpad/Buffer"
import type { ModifierState } from "@/types"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState, useEffect } from "react"
import { ControlBar } from "../components/Trackpad/ControlBar"
import { ExtraKeys } from "../components/Trackpad/ExtraKeys"
import { ScreenMirror } from "../components/Trackpad/ScreenMirror"
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
	const isComposingRef = useRef(false)
	const prevCompositionDataRef = useRef("")
	const [keyboardOpen, setKeyboardOpen] = useState(false)
	const [extraKeysVisible, setExtraKeysVisible] = useState(true)

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

	const { send, sendCombo } = useRemoteConnection()
	// Pass sensitivity and invertScroll to the gesture hook
	const { isTracking, handlers } = useTrackpadGesture(
		send,
		scrollMode,
		sensitivity,
		invertScroll,
	)

	// When keyboardOpen changes, focus or blur the hidden input
	useEffect(() => {
		if (keyboardOpen) {
			hiddenInputRef.current?.focus()
		} else {
			hiddenInputRef.current?.blur()
		}
	}, [keyboardOpen])

	const toggleKeyboard = () => {
		setKeyboardOpen((prev) => !prev)
	}

	const focusInput = () => {
		hiddenInputRef.current?.focus()
	}

	const handleClick = (button: "left" | "right") => {
		send({ type: "click", button, press: true })
		// Release after short delay to simulate click
		setTimeout(() => send({ type: "click", button, press: false }), 50)
	}

	const processCompositionDiff = (currentData: string, prevData: string) => {
		if (currentData === prevData) return

		// Find common prefix length
		let commonLen = 0
		while (
			commonLen < prevData.length &&
			commonLen < currentData.length &&
			prevData[commonLen] === currentData[commonLen]
		) {
			commonLen++
		}

		// Send backspaces for removed/changed characters
		const deletions = prevData.length - commonLen
		for (let i = 0; i < deletions; i++) {
			send({ type: "key", key: "backspace" })
		}

		// Send new characters individually
		const newChars = currentData.slice(commonLen)
		for (const char of newChars) {
			if (modifier !== "Release") {
				handleModifier(char)
			} else {
				send({ type: "text", text: char })
			}
		}
	}

	const handleCompositionStart = () => {
		isComposingRef.current = true
		prevCompositionDataRef.current = ""
	}

	const handleCompositionUpdate = (
		e: React.CompositionEvent<HTMLInputElement>,
	) => {
		const currentData = e.data || ""
		processCompositionDiff(currentData, prevCompositionDataRef.current)
		prevCompositionDataRef.current = currentData
	}

	const handleCompositionEnd = (
		e: React.CompositionEvent<HTMLInputElement>,
	) => {
		// Fallback to target value if data is empty (some mobile browsers)
		const currentData = e.data || e.currentTarget.value || ""
		processCompositionDiff(currentData, prevCompositionDataRef.current)
		prevCompositionDataRef.current = ""

		// Clear input to prevent buffer accumulation
		if (hiddenInputRef.current) {
			hiddenInputRef.current.value = ""
		}

		// Delay flag reset so the onChange firing after compositionend is suppressed
		setTimeout(() => {
			isComposingRef.current = false
		}, 0)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		// Skip during IME composition — composition handlers manage input
		if (e.nativeEvent.isComposing || isComposingRef.current) return

		const key = e.key.toLowerCase()

		if (modifier !== "Release") {
			if (key === "backspace") {
				e.preventDefault()
				setBuffer((prev) => prev.slice(0, -1))
				return
			}
			if (key === "escape") {
				e.preventDefault()
				setModifier("Release")
				setBuffer([])
				return
			}
			if (key !== "unidentified" && key.length > 1) {
				e.preventDefault()
				handleModifier(key)
			}
			return
		}

		if (key === "backspace") {
			e.preventDefault()
			send({ type: "key", key: "backspace" })
		} else if (key === "enter") {
			e.preventDefault()
			send({ type: "key", key: "enter" })
		} else if (key !== "unidentified" && key.length > 1) {
			send({ type: "key", key })
		}
	}

	const handleModifierState = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) {
					setModifier("Hold")
				} else {
					setModifier("Release")
				}
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
			return
		}
		if (modifier === "Active") {
			setBuffer((prev) => [...prev, key])
			return
		}
	}

	const sendText = (val: string) => {
		if (!val) return
		const toSend = val.length > 1 ? `${val} ` : val
		send({ type: "text", text: toSend })
	}

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (isComposingRef.current) return // Skip during IME composition
		const val = e.target.value
		if (val) {
			e.target.value = ""
			if (modifier !== "Release") {
				handleModifier(val)
			} else {
				sendText(val)
			}
		}
	}

	return (
		<div className="flex flex-col h-full min-h-0 bg-base-300 overflow-hidden">
			{/* TOUCH AREA / SCREEN MIRROR */}
			<div className="flex-1 min-h-0 relative flex flex-col border-b border-base-200">
				<ScreenMirror
					isTracking={isTracking}
					scrollMode={scrollMode}
					handlers={handlers}
				/>
				{bufferText !== "" && <BufferBar bufferText={bufferText} />}
			</div>

			{/* CONTROL BAR */}
			<div className="shrink-0 border-b border-base-200">
				<ControlBar
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
				className={`shrink-0 overflow-hidden transition-all duration-300
                ${
									!extraKeysVisible || keyboardOpen
										? "max-h-0 opacity-0 pointer-events-none"
										: "max-h-[50vh] opacity-100"
								}`}
			>
				{/* Extra Keys */}
				<ExtraKeys
					sendKey={(k) => {
						if (modifier !== "Release") handleModifier(k)
						else send({ type: "key", key: k })
					}}
					onInputFocus={focusInput}
				/>
			</div>

			{/* Hidden Input for Mobile Keyboard */}
			<input
				ref={hiddenInputRef}
				className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
				onKeyDown={handleKeyDown}
				onChange={handleInput}
				onCompositionStart={handleCompositionStart}
				onCompositionUpdate={handleCompositionUpdate}
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
			/>
		</div>
	)
}
