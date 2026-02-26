import type { ModifierState } from "@/types"
import type React from "react"

interface ControlBarProps {
	scrollMode: boolean
	modifier: ModifierState
	buffer: string
	onToggleScroll: () => void
	onLeftClick: () => void
	onRightClick: () => void
	onKeyboardToggle: () => void
	onModifierToggle: () => void
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
}) => {
	const handleInteraction = (e: React.PointerEvent, action: () => void) => {
		e.preventDefault()
		action()
	}

	const getModifierButtonClass = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) return "btn-success"
				return "btn-warning"
			case "Hold":
				return "btn-warning"
			default:
				return "btn-secondary"
		}
	}

	const getModifierLabel = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) return "Press"
				return "Release"
			case "Hold":
				return "Release"
			case "Release":
				return "Hold"
		}
	}

	return (
		<div className="bg-base-200 p-2 grid grid-cols-5 gap-2 shrink-0">
			<button
				type="button"
				className={`btn btn-sm ${scrollMode ? "btn-primary" : "btn-outline"}`}
				onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
			>
				{scrollMode ? "Scroll" : "Cursor"}
			</button>
			<button type="button" className="btn btn-sm btn-outline">
				Copy
			</button>
			<button type="button" className="btn btn-sm btn-outline">
				Paste
			</button>

			<button
				type="button"
				className="btn btn-sm btn-outline"
				onPointerDown={(e) => handleInteraction(e, onLeftClick)}
			>
				L-Click
			</button>

			<button
				type="button"
				className="btn btn-sm btn-outline"
				onPointerDown={(e) => handleInteraction(e, onRightClick)}
			>
				R-Click
			</button>
			<button
				type="button"
				className={`btn btn-sm ${getModifierButtonClass()}`}
				onPointerDown={(e) => handleInteraction(e, onModifierToggle)}
			>
				{getModifierLabel()}
			</button>
			<button
				type="button"
				className="btn btn-sm btn-secondary"
				onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
			>
				Keyboard
			</button>
		</div>
	)
}
