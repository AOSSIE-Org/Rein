import { useEffect, useRef, useState } from "react"
import { APP_CONFIG } from "../../config"
import { getAuthHeaders } from "../../utils/net"
import { t } from "../../utils/i18n"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../../utils/safeLocalStorage"
import ThemePicker, { THEME_LIST } from "../ThemePicker/ThemePicker"
import { GamepadLayoutSettings } from "../Gamepad/GamepadLayoutSettings"
import { MonitorOff, VolumeX, MousePointerClick } from "lucide-react"

export interface ClientTabProps {
	authToken: string
}

function SettingToggle({
	id,
	icon,
	label,
	description,
	checked,
	onChange,
}: {
	id: string
	icon: React.ReactNode
	label: string
	description: string
	checked: boolean
	onChange: (next: boolean) => void
}) {
	return (
		<label
			htmlFor={id}
			className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border cursor-pointer select-none transition-all duration-200 ${
				checked
					? "bg-primary/10 border-primary/40 text-primary"
					: "bg-base-100 border-base-300 text-base-content hover:border-base-content/30"
			}`}
		>
			<span
				className={`shrink-0 transition-colors duration-200 ${checked ? "text-primary" : "text-base-content/50"}`}
			>
				{icon}
			</span>

			<span className="flex flex-col flex-1 min-w-0">
				<span className="text-sm font-semibold leading-tight">{label}</span>
				<span
					className={`text-xs leading-tight mt-0.5 transition-colors duration-200 ${checked ? "text-primary/70" : "opacity-50"}`}
				>
					{description}
				</span>
			</span>

			<input
				id={id}
				type="checkbox"
				className="toggle toggle-primary toggle-sm shrink-0"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
		</label>
	)
}

export function ClientTab({ authToken }: ClientTabProps) {
	const [sensitivity, setSensitivity] = useState<number>(() => {
		const saved = getLocalStorageItem("rein_sensitivity")
		const parsed = saved ? Number.parseFloat(saved) : Number.NaN
		return Number.isFinite(parsed) ? parsed : 1.0
	})

	const [invertScroll, setInvertScroll] = useState<boolean>(() => {
		return getLocalStorageItem("rein_invert") === "true"
	})

	const [mirrorPaused, setMirrorPaused] = useState<boolean>(() => {
		return getLocalStorageItem("rein_mirror_paused") === "true"
	})

	const [audioMuted, setAudioMuted] = useState<boolean>(() => {
		return getLocalStorageItem("rein_audio_muted") === "true"
	})

	const [theme, setTheme] = useState(() => {
		const saved = getLocalStorageItem(APP_CONFIG.THEME_STORAGE_KEY)
		return THEME_LIST.some((t) => t.value === saved) ? saved : "dracula"
	})

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const setClientConfig = (
		sensitivityVal: number,
		invertedScrollVal: boolean,
	) => {
		setLocalStorageItem("rein_sensitivity", String(sensitivityVal))
		setLocalStorageItem("rein_invert", JSON.stringify(invertedScrollVal))

		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(() => {
			fetch("/api/config", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getAuthHeaders(authToken),
				},
				redirect: "error",
				body: JSON.stringify({
					sensitivity: sensitivityVal,
					invertScroll: invertedScrollVal,
				}),
			})
				.then((r) => r.json())
				.then((data) => {
					if (!data.ok) {
						console.error("Failed to update config on server:", data.error)
					}
				})
				.catch((err) => console.error("Error updating config:", err))
		}, 300)
	}

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	// Effect: Theme
	useEffect(() => {
		if (typeof window === "undefined") return
		setLocalStorageItem(APP_CONFIG.THEME_STORAGE_KEY, theme ?? "dracula")
		document.documentElement.setAttribute("data-theme", theme ?? "dracula")
	}, [theme])

	const handleMirrorPausedChange = (val: boolean) => {
		setMirrorPaused(val)
		setLocalStorageItem("rein_mirror_paused", JSON.stringify(val))
	}

	const handleAudioMutedChange = (val: boolean) => {
		setAudioMuted(val)
		setLocalStorageItem("rein_audio_muted", JSON.stringify(val))
	}

	return (
		<div className="space-y-8">
			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="sensitivity-slider">
					<span className="label-text">
						{t("clientTab", "mouseSensitivity")}
					</span>
					<span className="label-text-alt font-mono">
						{sensitivity.toFixed(1)}x
					</span>
				</label>

				<input
					type="range"
					id="sensitivity-slider"
					min="0.1"
					max="6.0"
					step="0.1"
					value={sensitivity}
					onChange={(e) => {
						const val = Number.parseFloat(e.target.value) || 1.0
						setSensitivity(val)
						setClientConfig(val, invertScroll)
					}}
					className="range range-primary range-sm w-full"
				/>

				<div className="mt-2 flex w-full justify-between px-2 text-xs opacity-50">
					<span>{t("clientTab", "slow")}</span>
					<span>{t("clientTab", "default")}</span>
					<span>{t("clientTab", "fast")}</span>
				</div>
			</div>

			{/* Boolean toggles — shared card-pill style */}
			<div className="flex flex-col gap-3">
				<SettingToggle
					id="invert-scroll-toggle"
					icon={<MousePointerClick />}
					label={t("clientTab", "invertScroll")}
					description={
						invertScroll
							? t("clientTab", "traditionalScrolling")
							: t("clientTab", "naturalScrolling")
					}
					checked={invertScroll}
					onChange={(val) => {
						setInvertScroll(val)
						setClientConfig(sensitivity, val)
					}}
				/>

				<SettingToggle
					id="stop-mirror-toggle"
					icon={<MonitorOff size={18} aria-hidden="true" />}
					label={t("clientTab", "stopMirror")}
					description={
						mirrorPaused
							? t("clientTab", "resumeMirrorDesc")
							: t("clientTab", "stopMirrorDesc")
					}
					checked={mirrorPaused}
					onChange={handleMirrorPausedChange}
				/>

				<SettingToggle
					id="mute-audio-toggle"
					icon={<VolumeX size={18} aria-hidden="true" />}
					label={t("clientTab", "muteAudio")}
					description={
						audioMuted
							? t("clientTab", "muteAudioDesc")
							: t("clientTab", "unmuteAudioDesc")
					}
					checked={audioMuted}
					onChange={handleAudioMutedChange}
				/>
			</div>

			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="theme-picker">
					<span className="label-text">{t("clientTab", "theme")}</span>
				</label>
				<ThemePicker value={theme ?? "dracula"} onChange={setTheme} />
			</div>

			{/* Gamepad button layout customisation */}
			<details className="collapse collapse-arrow border border-base-300 bg-base-100 rounded-box">
				<summary
					className="collapse-title text-sm font-medium cursor-pointer select-none"
					id="gamepad-layout-section"
				>
					{t("clientTab", "gamepadButtonLayout")}
				</summary>
				<div className="collapse-content pt-2">
					<GamepadLayoutSettings />
				</div>
			</details>
		</div>
	)
}
