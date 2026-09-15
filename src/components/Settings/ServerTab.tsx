import { useEffect, useState } from "react"
import { MdWarning } from "react-icons/md"
import { APP_CONFIG } from "../../config"
import { getAuthHeaders } from "../../utils/net"
import { t } from "../../utils/i18n"

export type StreamQuality = "performance" | "intermediate" | "quality"

export interface ServerTabProps {
	ip: string
	setIp: (ip: string) => void
	authToken: string
}

export function ServerTab({ ip, setIp, authToken }: ServerTabProps) {
	const [frontendPort, setFrontendPort] = useState("")

	// Server GStreamer config
	const [streamQuality, setStreamQuality] =
		useState<StreamQuality>("performance")
	const [framerate, setFramerate] = useState<number | null>(null)
	const [serverConfigSaved, setServerConfigSaved] = useState(false)
	const [serverConfigSaving, setServerConfigSaving] = useState(false)

	// Track if any server setting changed from the loaded values
	const [loadedStreamQuality, setLoadedStreamQuality] =
		useState<StreamQuality>("performance")
	const [loadedFramerate, setLoadedFramerate] = useState<number | null>(null)
	const [loadedPort, setLoadedPort] = useState("")

	const qualityOptions: {
		value: StreamQuality
		label: string
		desc: string
	}[] = [
		{
			value: "performance",
			label: t("serverTab", "qualityPerformance"),
			desc: t("serverTab", "qualityPerformanceDesc"),
		},
		{
			value: "intermediate",
			label: t("serverTab", "qualityBalanced"),
			desc: t("serverTab", "qualityBalancedDesc"),
		},
		{
			value: "quality",
			label: t("serverTab", "qualityQuality"),
			desc: t("serverTab", "qualityQualityDesc"),
		},
	]

	const serverConfigChanged =
		streamQuality !== loadedStreamQuality ||
		framerate !== loadedFramerate ||
		(frontendPort !== "" && frontendPort !== loadedPort)

	useEffect(() => {
		if (typeof window !== "undefined") {
			setFrontendPort(window.location.port)
			setLoadedPort(window.location.port)
		}
	}, [])

	// Load server config (framerate, streamQuality, frontendPort) from API
	useEffect(() => {
		if (typeof window === "undefined") return
		fetch("/api/config", {
			headers: getAuthHeaders(authToken),
			redirect: "error",
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.ok && data.config) {
					const q: StreamQuality =
						data.config.streamQuality === "intermediate" ||
						data.config.streamQuality === "quality"
							? data.config.streamQuality
							: "performance"
					setStreamQuality(q)
					setLoadedStreamQuality(q)
					const fr =
						typeof data.config.framerate === "number"
							? data.config.framerate
							: null
					setFramerate(fr)
					setLoadedFramerate(fr)

					if (data.config.frontendPort) {
						const portStr = String(data.config.frontendPort)
						setFrontendPort(portStr)
						setLoadedPort(portStr)
					}
				}
			})
			.catch((e) => console.error("Config fetch error:", e))
	}, [authToken])

	const handleSaveServerConfig = () => {
		const trimmedPort = frontendPort.trim()
		// Treat empty port as unchanged — omit frontendPort from the request
		let portPayload: { frontendPort?: number } = {}
		if (trimmedPort !== "") {
			if (!/^\d+$/.test(trimmedPort)) {
				alert(t("serverTab", "invalidPortAlert"))
				return
			}
			const port = Number.parseInt(trimmedPort, 10)
			if (!Number.isFinite(port) || port < 1 || port > 65535) {
				alert(t("serverTab", "invalidPortAlert"))
				return
			}
			portPayload = { frontendPort: port }
		}
		setServerConfigSaving(true)
		fetch("/api/config", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders(authToken),
			},
			redirect: "error",
			body: JSON.stringify({
				...portPayload,
				streamQuality,
				framerate,
			}),
		})
			.then((r) => r.json())
			.then((data) => {
				setServerConfigSaving(false)
				if (data.ok) {
					setServerConfigSaved(true)
					setLoadedStreamQuality(streamQuality)
					setLoadedFramerate(framerate)
					setFrontendPort(trimmedPort)
					if (trimmedPort !== "") setLoadedPort(trimmedPort)
				} else {
					alert(
						`Failed to save configuration: ${data.error || "Unknown error"}`,
					)
				}
			})
			.catch((err) => {
				setServerConfigSaving(false)
				alert(`Failed to connect to the server: ${String(err)}`)
			})
	}

	return (
		<div className="space-y-8">
			{/* Restart notice */}
			{serverConfigSaved && (
				<div className="alert alert-warning shadow-lg">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="stroke-current shrink-0 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
					>
						<title>Restart required</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span className="text-sm font-medium">
						{t("serverTab", "restartRequired")}
					</span>
				</div>
			)}

			{/* Stream Quality */}
			<div className="form-control w-full">
				<div className="label mb-3">
					<span className="label-text font-medium">
						{t("serverTab", "streamQuality")}
					</span>
				</div>
				<div className="flex flex-col gap-2">
					{qualityOptions.map((opt) => (
						<label
							key={opt.value}
							htmlFor={`quality-${opt.value}`}
							className={[
								"flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
								streamQuality === opt.value
									? "border-primary bg-primary/10"
									: "border-base-300 hover:border-primary/50",
							].join(" ")}
						>
							<input
								id={`quality-${opt.value}`}
								type="radio"
								name="stream-quality"
								className="radio radio-primary mt-0.5"
								value={opt.value}
								checked={streamQuality === opt.value}
								onChange={() => setStreamQuality(opt.value)}
							/>
							<div>
								<div className="font-semibold text-sm">{opt.label}</div>
								<div className="text-xs opacity-60">{opt.desc}</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Frame Rate */}
			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="framerate-slider">
					<span className="label-text font-medium">
						{t("serverTab", "limitFramerate")}
					</span>
				</label>

				<input
					id="framerate-slider"
					type="range"
					min="0"
					max="4"
					step="1"
					value={
						framerate === null
							? 4
							: ({ 24: 0, 30: 1, 60: 2, 120: 3 }[framerate] ?? 0)
					}
					onChange={(e) => {
						const value = Number.parseInt(e.target.value, 10)
						const rates: Array<number | null> = [24, 30, 60, 120, null]
						setFramerate(rates[value] ?? null)
					}}
					className="range range-primary range-sm w-full"
				/>

				<div className="mt-2 flex w-full justify-between px-1 text-xs opacity-60">
					<span>24 FPS</span>
					<span>30 FPS</span>
					<span>60 FPS</span>
					<span>120 FPS</span>
					<span>{t("serverTab", "noLimit")}</span>
				</div>
			</div>

			{/* Server IP */}
			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="server-ip-input">
					<span className="label-text font-medium">
						{t("serverTab", "serverIp")}
					</span>
				</label>

				<input
					id="server-ip-input"
					type="text"
					placeholder="192.168.1.X"
					className="input input-bordered w-full rounded-md"
					value={ip}
					onChange={(e) => setIp(e.target.value)}
				/>

				<label className="label" htmlFor="server-ip-input">
					<span className="label-text-alt opacity-50">
						{t("serverTab", "lanIpHelp")}
					</span>
				</label>
			</div>
			<div className="alert alert-warning text-xs shadow-lg">
				<MdWarning />
				<span>
					{t("serverTab", "firewallAlert", {
						port: frontendPort || APP_CONFIG.PORT,
					})}
				</span>
			</div>
			{/* Port */}
			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="port-input">
					<span className="label-text font-medium">
						{t("serverTab", "port")}
					</span>
				</label>
				<input
					id="port-input"
					type="text"
					placeholder={String(APP_CONFIG.PORT)}
					className="input input-bordered w-full rounded-md"
					value={frontendPort}
					onChange={(e) => setFrontendPort(e.target.value)}
				/>
			</div>
			<div className="alert alert-warning text-xs shadow-lg">
				<MdWarning />
				<span>{t("serverTab", "restartWarningAlert")}</span>
			</div>
			{/* Save Config — only visible in Server tab */}
			<button
				type="button"
				id="save-server-config-btn"
				className="btn btn-primary w-full rounded-md"
				disabled={!serverConfigChanged || serverConfigSaving}
				onClick={handleSaveServerConfig}
			>
				{serverConfigSaving ? (
					<>
						<span className="loading loading-spinner loading-sm" />
						{t("serverTab", "saving")}
					</>
				) : (
					t("serverTab", "saveConfig")
				)}
			</button>
		</div>
	)
}
