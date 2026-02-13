import { ModifierState } from "@/types";
import React from "react";

interface ControlBarProps {
	scrollMode: boolean;
	modifier: ModifierState;
	buffer: string;
	latency: number | null;
	onToggleScroll: () => void;
	onLeftClick: () => void;
	onRightClick: () => void;
	onKeyboardToggle: () => void;
	onModifierToggle: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
	scrollMode,
	modifier,
	buffer,
	latency,
	onToggleScroll,
	onLeftClick,
	onRightClick,
	onKeyboardToggle,
	onModifierToggle,
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

	const getLatencyColor = (ms: number) => {
		if (ms < 50) return "text-success";
		if (ms < 150) return "text-warning";
		return "text-error";
	};
	return (
		<div className="bg-base-200 p-2 shrink-0">
			<div className="flex justify-between items-center mb-2 px-1">
				<span className="text-xs font-mono opacity-70">
					{latency !== null ? (
						<span className={getLatencyColor(latency)}>Ping: {latency}ms</span>
					) : (
						"Ping: ---"
					)}
				</span>
			</div>
			<div className="grid grid-cols-6 gap-2">
				<button
					type="button"
					className={`btn btn-sm ${scrollMode ? "btn-primary" : "btn-outline"}`}
					onPointerDown={(e) => handleInteraction(e, onToggleScroll)}
				>
					{scrollMode ? "Scroll" : "Cursor"}
				</button>
				<button
					type="button"
					className="btn btn-sm btn-outline"
				>
					Copy
				</button>
				<button
					type="button"
					className="btn btn-sm btn-outline"
				>
					Paste
				</button>
				{/* 
				<button
					type="button"
					className="btn btn-sm btn-outline"
					onPointerDown={(e) => handleInteraction(e, onLeftClick)}
				>
					L-Click
				</button>
				*/}
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
		</div>
	);
};