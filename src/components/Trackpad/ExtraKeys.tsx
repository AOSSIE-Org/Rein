import type React from "react"
import { useState } from "react"
import {
	FaVolumeMute,
	FaVolumeDown,
	FaVolumeUp,
	FaPlay,
	FaPause,
	FaArrowUp,
	FaArrowDown,
	FaArrowLeft,
	FaArrowRight,
	FaLevelDownAlt,
	FaBackward,
	FaForward,
} from "react-icons/fa"
import { MdSpaceBar } from "react-icons/md"

interface ExtraKeysProps {
	sendKey: (key: string) => void
	onInputFocus: () => void
}

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey }) => {
	const [isPlaying, setIsPlaying] = useState(false)

	const handlePlayPause = () => {
		sendKey(isPlaying ? "audiopause" : "audioplay")
		setIsPlaying(!isPlaying)
	}

	const keys = [
		{ icon: <FaVolumeMute />, key: "audiomute", type: "media", label: "Mute" },
		{
			icon: <FaVolumeDown />,
			key: "audiovoldown",
			type: "media",
			label: "Vol Down",
		},
		{ icon: <FaVolumeUp />, key: "audiovolup", type: "media", label: "Vol Up" },
		{
			icon: <FaBackward />,
			key: "audioback",
			type: "media",
			label: "Backward",
		},
		{
			icon: isPlaying ? <FaPause /> : <FaPlay />,
			action: handlePlayPause,
			key: "playpause",
			type: "media",
			label: "Play/Pause",
		},
		{
			icon: <FaForward />,
			key: "audioforward",
			type: "media",
			label: "Forward",
		},

		{ label: "Esc", key: "escape", type: "action" },
		{ label: "Tab", key: "tab", type: "action" },
		{ label: "PtrSc", key: "printscreen", type: "action" },
		{ label: "End", key: "end", type: "action" },
		{ label: "PgUp", key: "pageup", type: "action" },
		{ label: "PgDn", key: "pagedown", type: "action" },

		{ label: "Meta", key: "meta", type: "mod" },
		{ label: "Alt", key: "alt", type: "mod" },
		{ icon: <MdSpaceBar />, key: "space", type: "action", label: "Space" },
		{ label: "Shift", key: "shift", type: "mod" },
		{ icon: <FaArrowUp />, key: "arrowup", type: "arrow", label: "Up" },
		{
			icon: <FaLevelDownAlt style={{ transform: "rotate(90deg)" }} />,
			key: "enter",
			type: "action",
			label: "Enter",
		},

		{ label: "Ctrl", key: "control", type: "mod" },
		{ label: "Menu", key: "menu", type: "mod" },
		{ label: "Del", key: "delete", type: "action" },
		{ icon: <FaArrowLeft />, key: "arrowleft", type: "arrow", label: "Left" },
		{ icon: <FaArrowDown />, key: "arrowdown", type: "arrow", label: "Down" },
		{
			icon: <FaArrowRight />,
			key: "arrowright",
			type: "arrow",
			label: "Right",
		},

		{ label: "F1", key: "f1", type: "fn" },
		{ label: "F2", key: "f2", type: "fn" },
		{ label: "F3", key: "f3", type: "fn" },
		{ label: "F4", key: "f4", type: "fn" },
		{ label: "F5", key: "f5", type: "fn" },
		{ label: "F6", key: "f6", type: "fn" },

		{ label: "F7", key: "f7", type: "fn" },
		{ label: "F8", key: "f8", type: "fn" },
		{ label: "F9", key: "f9", type: "fn" },
		{ label: "F10", key: "f10", type: "fn" },
		{ label: "F11", key: "f11", type: "fn" },
		{ label: "F12", key: "f12", type: "fn" },
	]

	const getBtnClass = (type?: string) => {
		switch (type) {
			case "arrow":
				return "btn-primary"
			case "mod":
				return "btn-secondary font-bold"
			case "fn":
				return "btn-neutral btn-outline text-xs"
			case "media":
				return "btn-accent btn-outline"
			case "action":
				return "btn-neutral"
			default:
				return "btn-neutral"
		}
	}

	return (
		<div className="grid grid-cols-6 grid-rows-6 gap-1 p-1 w-full bg-base-300">
			{keys.map((k, i) => (
				<button
					type="button"
					key={k.key}
					className={`btn btn-xs h-10 min-h-0 w-full rounded-md shadow-sm ${getBtnClass(k.type)} flex items-center justify-center p-0`}
					onPointerDown={(e) => {
						e.preventDefault()
						if (k.action) k.action()
						else if (k.key) sendKey(k.key)
					}}
					aria-label={k.label || k.key}
				>
					{k.icon || k.label || k.key}
				</button>
			))}
		</div>
	)
}
