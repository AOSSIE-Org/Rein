import React, { useState } from "react";

interface ExtraKeysProps {
	sendKey: (key: string) => void;
	onInputFocus?: () => void;
}

/** All extra keys in one row (must match KeyMap.ts). Play/Pause is a single toggle. */
const EXTRA_KEYS: { label: string; key: string }[] = [
	{ label: "Esc", key: "esc" },
	{ label: "Tab", key: "tab" },
	{ label: "Ctrl", key: "ctrl" },
	{ label: "Alt", key: "alt" },
	{ label: "Shift", key: "shift" },
	{ label: "Meta", key: "meta" },
	{ label: "Home", key: "home" },
	{ label: "End", key: "end" },
	{ label: "PgUp", key: "pgup" },
	{ label: "PgDn", key: "pgdn" },
	{ label: "Ins", key: "insert" },
	{ label: "Del", key: "del" },
	{ label: "↑", key: "arrowup" },
	{ label: "↓", key: "arrowdown" },
	{ label: "←", key: "arrowleft" },
	{ label: "→", key: "arrowright" },
	{ label: "F1", key: "f1" },
	{ label: "F2", key: "f2" },
	{ label: "F3", key: "f3" },
	{ label: "F4", key: "f4" },
	{ label: "F5", key: "f5" },
	{ label: "F6", key: "f6" },
	{ label: "F7", key: "f7" },
	{ label: "F8", key: "f8" },
	{ label: "F9", key: "f9" },
	{ label: "F10", key: "f10" },
	{ label: "F11", key: "f11" },
	{ label: "F12", key: "f12" },
	{ label: "Mute", key: "audiomute" },
	{ label: "Vol−", key: "audiovoldown" },
	{ label: "Vol+", key: "audiovolup" },
	{ label: "Prev", key: "audioprev" },
	{ label: "Next", key: "audionext" },
];

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey, onInputFocus: _onInputFocus }) => {
	const [isPlaying, setIsPlaying] = useState(false);

	const handleInteract = (e: React.PointerEvent, key: string) => {
		e.preventDefault();
		sendKey(key);
	};

	const handlePlayPause = (e: React.PointerEvent) => {
		e.preventDefault();
		if (isPlaying) {
			sendKey("audiopause");
		} else {
			sendKey("audioplay");
		}
		setIsPlaying((prev) => !prev);
	};

	return (
		<div
			className="bg-base-300 p-2 shrink-0 overflow-x-auto"
			style={{ WebkitOverflowScrolling: "touch" }}
		>
			<div className="flex gap-2 flex-nowrap items-center min-w-max">
				{EXTRA_KEYS.map(({ label, key }) => (
					<button
						key={key}
						type="button"
						className="btn btn-sm btn-neutral min-w-[2.5rem] shrink-0"
						onPointerDown={(e) => handleInteract(e, key)}
					>
						{label}
					</button>
				))}
				<button
					type="button"
					className="btn btn-sm btn-neutral min-w-[2.5rem] shrink-0"
					onPointerDown={handlePlayPause}
					title={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? "Pause" : "Play"}
				</button>
			</div>
		</div>
	);
};
