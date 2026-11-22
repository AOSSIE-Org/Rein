import type React from "react"
import { useState } from "react"
import { t } from "@/utils/i18n"
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	CornerDownLeft,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	Space,
	Volume1,
	Volume2,
	VolumeX,
} from "lucide-react"

interface ExtraKeysProps {
	sendKey: (key: string) => void
	onInputFocus: () => void
	orientation?: "horizontal" | "vertical"
}

export const ExtraKeys: React.FC<ExtraKeysProps> = ({
	sendKey,
	orientation = "horizontal",
}) => {
	const [isPlaying, setIsPlaying] = useState(false)

	const handlePlayPause = () => {
		sendKey(isPlaying ? "audiopause" : "audioplay")
		setIsPlaying(!isPlaying)
	}

	const keyGroups = [
		[
			{
				icon: <VolumeX size={16} />,
				key: "audiomute",
				type: "media",
				label: t("extraKeys", "mute"),
			},
			{
				icon: <Volume1 size={16} />,
				key: "audiovoldown",
				type: "media",
				label: t("extraKeys", "volDown"),
			},
			{
				icon: <Volume2 size={16} />,
				key: "audiovolup",
				type: "media",
				label: t("extraKeys", "volUp"),
			},
			{
				icon: <SkipBack size={16} />,
				key: "audioprev",
				type: "media",
				label: t("extraKeys", "prev"),
			},
			{
				icon: isPlaying ? <Pause size={16} /> : <Play size={16} />,
				action: handlePlayPause,
				key: "playpause",
				type: "media",
				label: t("extraKeys", "playPause"),
			},
			{
				icon: <SkipForward size={16} />,
				key: "audionext",
				type: "media",
				label: t("extraKeys", "next"),
			},
		],
		[
			{ label: t("extraKeys", "esc"), key: "escape", type: "action" },
			{ label: t("extraKeys", "tab"), key: "tab", type: "action" },
			{ label: t("extraKeys", "ptrSc"), key: "printscreen", type: "action" },
			{ label: t("extraKeys", "end"), key: "end", type: "action" },
			{ label: t("extraKeys", "pgUp"), key: "pageup", type: "action" },
			{ label: t("extraKeys", "pgDn"), key: "pagedown", type: "action" },
		],
		[
			{ label: t("extraKeys", "meta"), key: "meta", type: "mod" },
			{ label: t("extraKeys", "alt"), key: "alt", type: "mod" },
			{
				icon: <Space size={16} />,
				key: "space",
				type: "action",
				label: t("extraKeys", "space"),
			},
			{ label: t("extraKeys", "shift"), key: "shift", type: "mod" },
			{
				icon: <ArrowUp size={16} />,
				key: "arrowup",
				type: "arrow",
				label: t("extraKeys", "up"),
			},
			{
				icon: <CornerDownLeft size={16} />,
				key: "enter",
				type: "action",
				label: t("extraKeys", "enter"),
			},
		],
		[
			{ label: t("extraKeys", "ctrl"), key: "control", type: "mod" },
			{ label: t("extraKeys", "menu"), key: "menu", type: "mod" },
			{ label: t("extraKeys", "del"), key: "delete", type: "action" },
			{
				icon: <ArrowLeft size={16} />,
				key: "arrowleft",
				type: "arrow",
				label: t("extraKeys", "left"),
			},
			{
				icon: <ArrowDown size={16} />,
				key: "arrowdown",
				type: "arrow",
				label: t("extraKeys", "down"),
			},
			{
				icon: <ArrowRight size={16} />,
				key: "arrowright",
				type: "arrow",
				label: t("extraKeys", "right"),
			},
		],
		[
			{ label: "F1", key: "f1", type: "fn" },
			{ label: "F2", key: "f2", type: "fn" },
			{ label: "F3", key: "f3", type: "fn" },
			{ label: "F4", key: "f4", type: "fn" },
			{ label: "F5", key: "f5", type: "fn" },
			{ label: "F6", key: "f6", type: "fn" },
		],
		[
			{ label: "F7", key: "f7", type: "fn" },
			{ label: "F8", key: "f8", type: "fn" },
			{ label: "F9", key: "f9", type: "fn" },
			{ label: "F10", key: "f10", type: "fn" },
			{ label: "F11", key: "f11", type: "fn" },
			{ label: "F12", key: "f12", type: "fn" },
		],
	]

	const keyGroupsVertical = [
		keyGroups[0], // Media
		[
			...keyGroups[1],
			...[
				{
					icon: <Space size={16} />,
					key: "space",
					type: "action",
					label: t("extraKeys", "space"),
				},
				{ label: t("extraKeys", "meta"), key: "meta", type: "mod" },
				{ label: t("extraKeys", "alt"), key: "alt", type: "mod" },
				{ label: t("extraKeys", "shift"), key: "shift", type: "mod" },
				{ label: t("extraKeys", "ctrl"), key: "control", type: "mod" },
				{ label: t("extraKeys", "menu"), key: "menu", type: "mod" },
			],
		],
		[
			{ label: t("extraKeys", "del"), key: "delete", type: "action" },
			{
				icon: <ArrowUp size={16} />,
				key: "arrowup",
				type: "arrow",
				label: t("extraKeys", "up"),
			},
			{
				icon: <CornerDownLeft size={16} />,
				key: "enter",
				type: "action",
				label: t("extraKeys", "enter"),
			},
			{
				icon: <ArrowLeft size={16} />,
				key: "arrowleft",
				type: "arrow",
				label: t("extraKeys", "left"),
			},
			{
				icon: <ArrowDown size={16} />,
				key: "arrowdown",
				type: "arrow",
				label: t("extraKeys", "down"),
			},
			{
				icon: <ArrowRight size={16} />,
				key: "arrowright",
				type: "arrow",
				label: t("extraKeys", "right"),
			},
		],
		[...keyGroups[4], ...keyGroups[5]],
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
				return "btn-accent"
			case "action":
				return "btn-neutral"
			default:
				return "btn-neutral"
		}
	}

	const renderKey = (k: {
		icon?: React.ReactNode
		key: string
		type?: string
		label?: string
		action?: () => void
	}) => (
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
	)
	if (orientation === "vertical") {
		return (
			<div className="flex flex-col gap-4 w-full">
				{keyGroupsVertical.map((group, _i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: vertical key groups are stateless layout wrappers
						key={_i}
						className="grid grid-cols-3 gap-1.5 w-full"
					>
						{group.map((k) => renderKey(k))}
					</div>
				))}
			</div>
		)
	}
	const keys = keyGroups.flat()
	return (
		<div className="grid grid-cols-6 grid-rows-6 gap-1 p-1 w-full bg-base-100">
			{keys.map((k) => renderKey(k))}
		</div>
	)
}
