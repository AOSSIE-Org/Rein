import { ModifierState } from "@/types";
import React from "react";

interface ControlBarProps {
	scrollMode: boolean;
	modifier: ModifierState;
	buffer: string;
	clipboardOpen: boolean;
	onToggleScroll: () => void;
	onRightClick: () => void;
	onKeyboardToggle: () => void;
	onModifierToggle: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onClipboardToggle: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	clipboardOpen,
	onToggleScroll,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
	onCopy,
	onPaste,
	onClipboardToggle,
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
		<div className="bg-base-200 p-2 grid grid-cols-7 gap-2 shrink-0">
			<button
				className={`btn btn-sm ${scrollMode ? "btn-primary" : "btn-outline"}`}
				onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
			>
				{scrollMode ? "Scroll" : "Cursor"}
			</button>
			<button
				className="btn btn-sm btn-outline"
				onPointerDown={(e) => handleInteraction(e, onCopy)}
			>
				Copy
			</button>
			<button
				className="btn btn-sm btn-outline"
				onPointerDown={(e) => handleInteraction(e, onPaste)}
			>
				Paste
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
				className={`btn btn-sm ${clipboardOpen ? 'btn-primary' : 'btn-outline'}`}
				onPointerDown={(e) => handleInteraction(e, onClipboardToggle)}
				title="Clipboard Sync"
			>
				📋
			</button>
			<button
				className="btn btn-sm btn-secondary"
				onPointerDown={(e) => handleInteraction(e, onKeyboardToggle)}
			>
				Keyboard
			</button>
		</div>
	);
};
