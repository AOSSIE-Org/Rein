import { ModifierState } from "@/types";
import React from "react";

interface ControlBarProps {
	scrollMode: boolean;
	modifier: ModifierState;
	buffer: string;
	clipboardSyncEnabled: boolean; // ← ADDED
	onToggleScroll: () => void;
	onLeftClick: () => void;
	onRightClick: () => void;
	onKeyboardToggle: () => void;
	onModifierToggle: () => void;
	onPaste: () => void;
	onCopy: () => void;
	onToggleClipboardSync: () => void; // ← ADDED
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	clipboardSyncEnabled, // ← ADDED
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
	onPaste,
	onCopy,
	onToggleClipboardSync, // ← ADDED
}) => {
	const handleInteraction = (e: React.PointerEvent, action: () => void) => {
		e.preventDefault();
		action();
	};

	const getModifierButtonClass = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) return "btn-success"
				else return "btn-warning";
			case "Hold":
				return "btn-warning";
			case "Release":
			default:
				return "btn-secondary";
		}
	};

	const getModifierLabel = () => {
		switch (modifier) {
			case "Active":
				if (buffer.length > 0) return "Press"
				else return "Release";
			case "Hold":
				return "Release";
			case "Release":
				return "Hold";
		}
	};

	return (
		<>
			{/* ========== CLIPBOARD SYNC TOGGLE (NEW) ========== */}
			<div className="bg-base-300 px-3 py-2 flex items-center justify-between border-t border-base-content/10">
				<span className="text-xs opacity-70">📋 Clipboard Sync</span>
				<label className="swap swap-flip">
					<input 
						type="checkbox" 
						checked={clipboardSyncEnabled}
						onChange={() => onToggleClipboardSync()}
					/>
					<div className="swap-on text-xs font-bold text-success">ON</div>
					<div className="swap-off text-xs font-bold text-error">OFF</div>
				</label>
			</div>
			{/* ================================================== */}

			<div className="bg-base-200 p-2 grid grid-cols-5 gap-2 shrink-0">
				<button
					className={`btn btn-sm ${scrollMode ? "btn-primary" : "btn-outline"}`}
					onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
				>
					{scrollMode ? "Scroll" : "Cursor"}
				</button>
				<button
					className="btn btn-sm btn-accent"
					onPointerDown={(e) => handleInteraction(e, onCopy)}
				>
					✂️ Copy
				</button>
				<button
					className="btn btn-sm btn-primary"
					onPointerDown={(e) => handleInteraction(e, onPaste)}
				>
					📋 Paste
				</button>
				<button
					className="btn btn-sm btn-outline"
					onPointerDown={(e) => handleInteraction(e, onRightClick)}
				>
					R-Click
				</button>
				<button
					className={`btn btn-sm ${getModifierButtonClass()}`}
					onPointerDown={(e) => handleInteraction(e, onModifierToggle)}
				>
					{getModifierLabel()}
				</button>
				<button
					className="btn btn-sm btn-secondary"
					onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
				>
					Keyboard
				</button>
			</div>
		</>
	);
};