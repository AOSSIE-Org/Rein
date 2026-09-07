import { useEffect, useRef, useState } from "react"
import { APP_CONFIG } from "../../config"
import { getAuthHeaders } from "../../utils/net"
import { t } from "../../utils/i18n"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../../utils/safeLocalStorage"
import ThemePicker, { THEME_LIST } from "../ThemePicker/ThemePicker"

export interface ClientTabProps {
	authToken: string
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

			<div className="form-control w-full">
				<label className="label cursor-pointer" htmlFor="invert-scroll-toggle">
					<span className="label-text font-medium">
						{t("clientTab", "invertScroll")}
					</span>
					<input
						id="invert-scroll-toggle"
						type="checkbox"
						className="toggle toggle-primary"
						checked={invertScroll}
						onChange={(e) => {
							const val = e.target.checked
							setInvertScroll(val)
							setClientConfig(sensitivity, val)
						}}
					/>
				</label>

				<label className="label" htmlFor="invert-scroll-toggle">
					<span className="label-text-alt opacity-50">
						{invertScroll
							? t("clientTab", "traditionalScrolling")
							: t("clientTab", "naturalScrolling")}
					</span>
				</label>
			</div>

			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="theme-picker">
					<span className="label-text">{t("clientTab", "theme")}</span>
				</label>
				<ThemePicker value={theme ?? "dracula"} onChange={setTheme} />
			</div>
		</div>
	)
}
