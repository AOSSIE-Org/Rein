import type { ModifierState } from "@/types"
import type React from "react"
import {
	MousePointer2,
	Mouse,
	Copy,
	ClipboardPaste,
	Keyboard,
	X,
} from "lucide-react"

interface ControlBarProps {
	scrollMode: boolean
	modifier: ModifierState
	buffer: string
	onToggleScroll: () => void
	onLeftClick: () => void
	onRightClick: () => void
	onKeyboardToggle: () => void
	onModifierToggle: () => void
	keyboardOpen: boolean
	extraKeysVisible: boolean
	onExtraKeysToggle: () => void
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
	buffer,
}) => {
	const handleInteraction = (e: React.PointerEvent, action: () => void) => {
		e.preventDefault()
		action()
	}

	const getModifierLabel = () => {
		switch (modifier) {
			case "Active":
				return buffer.length > 0 ? "Press" : "Release"
			case "Hold":
				return "Release"
			case "Release":
				return "Hold"
		}
	}

	const baseButton =
		"flex-1 flex items-center justify-center h-[44px] bg-base-100 hover:bg-base-300 active:scale-[0.97] transition-all duration-100"

	const ModifierButton = () => {
		const isHold = modifier === "Hold"
		const label = getModifierLabel()

		return (
			<button
				type="button"
				className={`flex items-center justify-center w-[54px] h-[44px] transition-all duration-100 ${
					isHold
						? "bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-800"
						: "bg-base-100 hover:bg-base-300"
				}`}
				onPointerDown={(e) => handleInteraction(e, onModifierToggle)}
			>
				{label === "Release" ? (
					<X size={26} strokeWidth={3.5} className="text-red-600" />
				) : (
					<span className="text-xs font-bold">{label}</span>
				)}
			</button>
		)
	}

	return (
		<div className="flex w-full bg-base-200 border-b border-base-300 pr-1">
			<button
				type="button"
				className={`${baseButton} ${scrollMode ? "text-primary" : ""}`}
				onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
			>
				<MousePointer2 size={20} />
			</button>

			<button
				type="button"
				className={baseButton}
				onPointerDown={(e) => handleInteraction(e, onLeftClick)}
			>
				<Mouse size={18} />
			</button>

			<button
				type="button"
				className={baseButton}
				onPointerDown={(e) => handleInteraction(e, onRightClick)}
			>
				<Mouse size={18} className="rotate-180" />
			</button>

			<button type="button" className={baseButton}>
				<Copy size={18} />
			</button>

			<button type="button" className={baseButton}>
				<ClipboardPaste size={18} />
			</button>

			<button
				type="button"
				className={baseButton}
				onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
			>
				<Keyboard size={20} />
			</button>

			<ModifierButton />
		</div>
	)
}
