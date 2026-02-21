import React, { useState } from "react";

interface ExtraKeysProps {
	sendKey: (key: string) => void;
	onInputFocus?: () => void;
	visibleRows?: number;
	startRow?: number;
	noTopBorder?: boolean;
}

type KeyDef = {
	label: string;
	key: string;
	color?: "default" | "modifier" | "arrow" | "media" | "danger" | "action";
	wide?: boolean;
	icon?: string;
};

const KEY_ROWS: KeyDef[][] = [

	[
		{ label: "Meta", key: "meta", color: "modifier" },
		{ label: "Alt", key: "alt", color: "modifier" },
		{ label: "Space", key: "space", wide: false },
		{ label: "Shift", key: "shift", color: "modifier" },
		{ label: "▲", key: "arrowup", color: "arrow" },
		{ label: "⌫", key: "backspace", color: "danger" },
	],
	[
		{ label: "Ctrl", key: "ctrl", color: "modifier" },
		{ label: "Menu", key: "menu" },
		{ label: "PrtSc", key: "printscreen", color: "action" },
		{ label: "◀", key: "arrowleft", color: "arrow" },
		{ label: "▼", key: "arrowdown", color: "arrow" },
		{ label: "▶", key: "arrowright", color: "arrow" },
	],
	[
		{ label: "Ins", key: "insert" },
		{ label: "Del", key: "del", color: "danger" },
		{ label: "🔇", key: "audiomute", color: "media" },
		{ label: "🔉", key: "audiovoldown", color: "media" },
		{ label: "🔊", key: "audiovolup", color: "media" },
		{ label: "⏵", key: "audioplay", color: "media" },
	],
	[
		{ label: "Esc", key: "esc", color: "action" },
		{ label: "Tab", key: "tab", color: "action" },
		{ label: "Home", key: "home" },
		{ label: "End", key: "end" },
		{ label: "PgUp", key: "pgup" },
		{ label: "PgDn", key: "pgdn" },
	],
	[
		{ label: "F1", key: "f1" },
		{ label: "F2", key: "f2" },
		{ label: "F3", key: "f3" },
		{ label: "F4", key: "f4" },
		{ label: "F5", key: "f5" },
		{ label: "F6", key: "f6" },
	],
	[
		{ label: "F7", key: "f7" },
		{ label: "F8", key: "f8" },
		{ label: "F9", key: "f9" },
		{ label: "F10", key: "f10" },
		{ label: "F11", key: "f11" },
		{ label: "F12", key: "f12" },
	],
];

const colorClasses: Record<string, string> = {
	default: "bg-[#1e2433] hover:bg-[#2a3347] text-[#c8d0e0] border border-[#2e3a50] active:scale-95 active:bg-[#151c2c]",
	modifier: "bg-[#4c3b8a] hover:bg-[#5d48a8] text-white border border-[#6b55c4] active:scale-95 active:bg-[#3a2c6a]",
	arrow: "bg-[#c4187e] hover:bg-[#d9259a] text-white border border-[#e030a8] active:scale-95 active:bg-[#9e1265]",
	media: "bg-[#1e2433] hover:bg-[#2a3347] text-amber-400 border border-amber-500/60 active:scale-95 active:bg-[#151c2c]",
	danger: "bg-[#1e2433] hover:bg-[#2e1a1a] text-rose-400 border border-rose-500/40 active:scale-95",
	action: "bg-[#1e2433] hover:bg-[#263040] text-sky-300 border border-sky-500/30 active:scale-95",
};

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey, visibleRows, startRow = 0, noTopBorder }) => {
	const [isPlayingMedia, setIsPlayingMedia] = useState(false);

	const handleKey = (e: React.PointerEvent, key: KeyDef) => {
		e.preventDefault();

		if (key.key === "audioplay") {
			if (isPlayingMedia) {
				sendKey("audiopause");
			} else {
				sendKey("audioplay");
			}
			setIsPlayingMedia((p) => !p);
			return;
		}

		sendKey(key.key);
	};

	let rowsToRender = KEY_ROWS;

	if (visibleRows !== undefined) {
		rowsToRender = KEY_ROWS.slice(startRow, startRow + visibleRows);
	} else if (startRow > 0) {
		rowsToRender = KEY_ROWS.slice(startRow);
	}

	return (
		<div
			className={`shrink-0 select-none bg-[linear-gradient(180deg,#111827_0%,#0d1117_100%)] ${noTopBorder ? "border-t-0 pt-0" : "border-t border-[rgba(255,255,255,0.06)] pt-[8px]"} pb-[5px] px-[5px]`}
		>
			{rowsToRender.map((row, rowIdx) => {
				const isLastRow = rowIdx === rowsToRender.length - 1;

				return (
					<div
						key={rowIdx}
						className={`grid gap-[4px] ${!isLastRow ? "mb-[4px]" : ""}`}
						style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
					>
						{row.map((keyDef) => {
							const isPlayPause = keyDef.key === "audioplay";
							const displayLabel =
								isPlayPause
									? isPlayingMedia
										? "⏸"
										: "▶"
									: keyDef.label;

							const cls = colorClasses[keyDef.color ?? "default"];

							return (
								<button
									key={`${rowIdx}-${keyDef.key}-${keyDef.label}`}
									type="button"
									className={`${cls} rounded-[6px] font-mono text-center transition-all duration-75 cursor-pointer touch-none relative flex items-center justify-center h-[clamp(34px,6.5vw,46px)] text-[clamp(9px,2.2vw,13px)] font-semibold tracking-[0.01em] shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]`}
									onPointerDown={(e) => handleKey(e, keyDef)}
								>
									{displayLabel}
								</button>
							);
						})}
					</div>
				);
			})}

		</div>
	);
};
