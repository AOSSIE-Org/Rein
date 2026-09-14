"use client"
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
import { t } from "@/utils/i18n"

interface ControlBarProps {
	scrollMode: boolean
	modifier: ModifierState
	buffer: string
	onToggleScroll: () => void
	onCopy: () => void
	onPaste: () => void
	onLeftClick: () => void
	onRightClick: () => void
	onKeyboardToggle: () => void
	onModifierToggle: () => void
	keyboardOpen: boolean
	extraKeysVisible: boolean
	onExtraKeysToggle: () => void
	orientation?: "horizontal" | "vertical"
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onCopy,
	onPaste,
	onKeyboardToggle,
	onModifierToggle,
	buffer,
	orientation = "horizontal",
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
	if (orientation === "horizontal") {
		const baseButton =
			"flex-1 flex items-center justify-center h-[44px] bg-base-100 hover:bg-base-300 active:scale-[0.97] transition-all duration-100"
		const isHold = modifier === "Hold"
		const modLabel = getModifierLabel()

		return (
			<div className="flex w-full bg-base-200 border-b border-base-300 pr-1">
				<button
					type="button"
					className={`${baseButton} ${scrollMode ? "text-primary" : ""}`}
					onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
					aria-label={t("controlBar", "scrollMode")}
				>
					<MousePointer2 size={20} />
				</button>

				<button
					type="button"
					className={baseButton}
					onPointerDown={(e) => handleInteraction(e, onLeftClick)}
					aria-label={t("controlBar", "leftClick")}
				>
					<Mouse size={18} />
				</button>

				<button
					type="button"
					className={baseButton}
					onPointerDown={(e) => handleInteraction(e, onRightClick)}
					aria-label={t("controlBar", "rightClick")}
				>
					<Mouse size={18} className="rotate-180" />
				</button>

				<button
					type="button"
					className={baseButton}
					onPointerDown={(e) => handleInteraction(e, onCopy)}
					aria-label={t("controlBar", "copy")}
				>
					<Copy size={18} />
				</button>

				<button
					type="button"
					className={baseButton}
					onPointerDown={(e) => handleInteraction(e, onPaste)}
					aria-label={t("controlBar", "paste")}
				>
					<ClipboardPaste size={18} />
				</button>

				<button
					type="button"
					className={baseButton}
					onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
					aria-label={t("controlBar", "keyboard")}
				>
					<Keyboard size={20} />
				</button>

				{/* Modifier button keeps its fixed width in horizontal mode */}
				<button
					type="button"
					className={`flex items-center justify-center w-[54px] h-[44px] transition-all duration-100 ${
						isHold
							? "bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-800"
							: "bg-base-100 hover:bg-base-300"
					}`}
					onPointerDown={(e) => handleInteraction(e, onModifierToggle)}
					aria-label={t("controlBar", "modifier")}
				>
					{modLabel === "Release" ? (
						<X size={26} strokeWidth={3.5} className="text-red-600" />
					) : (
						<span className="text-xs font-bold">{modLabel}</span>
					)}
				</button>
			</div>
		)
	}

	const isHold = modifier === "Hold"
	const modLabel = getModifierLabel()

	const gridBtn =
		"btn btn-xs h-10 min-h-0 w-full rounded-md shadow-sm btn-neutral flex items-center justify-center p-0 active:scale-[0.97] transition-all duration-100"

	return (
		<div className="grid grid-cols-3 gap-1.5 w-full">
			{/* Row 1 */}
			<button
				type="button"
				className={`${gridBtn} ${scrollMode ? "btn-primary" : ""}`}
				onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
				aria-label={t("controlBar", "scrollMode")}
			>
				<MousePointer2 size={18} />
			</button>

			<button
				type="button"
				className={gridBtn}
				onPointerDown={(e) => handleInteraction(e, onLeftClick)}
				aria-label={t("controlBar", "leftClick")}
			>
				<Mouse size={18} />
			</button>

			<button
				type="button"
				className={gridBtn}
				onPointerDown={(e) => handleInteraction(e, onRightClick)}
				aria-label={t("controlBar", "rightClick")}
			>
				<Mouse size={18} className="rotate-180" />
			</button>

			{/* Row 2 */}
			<button
				type="button"
				className={gridBtn}
				onPointerDown={(e) => handleInteraction(e, onCopy)}
				aria-label={t("controlBar", "copy")}
			>
				<Copy size={18} />
			</button>

			<button
				type="button"
				className={gridBtn}
				onPointerDown={(e) => handleInteraction(e, onPaste)}
				aria-label={t("controlBar", "paste")}
			>
				<ClipboardPaste size={18} />
			</button>

			<button
				type="button"
				className={gridBtn}
				onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
				aria-label={t("controlBar", "keyboard")}
			>
				<Keyboard size={18} />
			</button>

			{/* Row 3 */}
			<button
				type="button"
				className={`${gridBtn} col-span-3 ${
					isHold ? "bg-neutral-900 hover:bg-neutral-800 border-0" : ""
				}`}
				onPointerDown={(e) => handleInteraction(e, onModifierToggle)}
				aria-label={t("controlBar", "modifier")}
			>
				{modLabel === "Release" ? (
					<X size={20} strokeWidth={3.5} className="text-red-600" />
				) : (
					<span className="text-xs font-bold">{modLabel}</span>
				)}
			</button>
		</div>
	)
}
