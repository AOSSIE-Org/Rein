import { useEffect, useState } from "react"
import { TriangleAlert } from "lucide-react"
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

	// Server GStreamer & file directory config
	const [streamQuality, setStreamQuality] =
		useState<StreamQuality>("performance")
	const [framerate, setFramerate] = useState<number | null>(null)
	const [uploadDir, setUploadDir] = useState("")
	const [monitorIndex, setMonitorIndex] = useState<number>(0)
	const [serverConfigSaved, setServerConfigSaved] = useState(false)
	const [serverConfigSaving, setServerConfigSaving] = useState(false)

	// Track if any server setting changed from the loaded values
	const [loadedStreamQuality, setLoadedStreamQuality] =
		useState<StreamQuality>("performance")
	const [loadedFramerate, setLoadedFramerate] = useState<number | null>(null)
	const [loadedPort, setLoadedPort] = useState("")
	const [loadedUploadDir, setLoadedUploadDir] = useState("")
	const [loadedMonitorIndex, setLoadedMonitorIndex] = useState<number>(0)

	const displayOptions: {
		value: number
		label: string
		desc: string
	}[] = [
		{
			value: 0,
			label: t("serverTab", "displayPrimary"),
			desc: t("serverTab", "displayPrimaryDesc"),
		},
		{
			value: 1,
			label: t("serverTab", "displaySecondary"),
			desc: t("serverTab", "displaySecondaryDesc"),
		},
	]

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
		uploadDir !== loadedUploadDir ||
		monitorIndex !== loadedMonitorIndex ||
		(frontendPort !== "" && frontendPort !== loadedPort)

	useEffect(() => {
		if (typeof window !== "undefined") {
			setFrontendPort(window.location.port)
			setLoadedPort(window.location.port)
		}
	}, [])

	// Load server config (framerate, streamQuality, frontendPort, uploadDir) from API
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

					if (data.config.uploadDir) {
						setUploadDir(data.config.uploadDir)
						setLoadedUploadDir(data.config.uploadDir)
					}

					if (typeof data.config.monitorIndex === "number") {
						setMonitorIndex(data.config.monitorIndex)
						setLoadedMonitorIndex(data.config.monitorIndex)
					}
				}
			})
			.catch((e) => console.error("Config fetch error:", e))
	}, [authToken])

	const handleSaveServerConfig = () => {
		const trimmedPort = frontendPort.trim()
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
				uploadDir,
				displayMode: monitorIndex === 1 ? "extended" : "duplicate",
				monitorIndex,
			}),
		})
			.then((r) => r.json())
			.then((data) => {
				setServerConfigSaving(false)
				if (data.ok) {
					setServerConfigSaved(true)
					setLoadedStreamQuality(streamQuality)
					setLoadedFramerate(framerate)
					setLoadedUploadDir(uploadDir)
					setLoadedMonitorIndex(monitorIndex)
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
					<TriangleAlert className="w-5 h-5 shrink-0" />
					<span className="text-sm font-medium">
						{t("serverTab", "restartRequired")}
					</span>
				</div>
			)}

			{/* Display Mode / Screen */}
			<div className="form-control w-full">
				<div className="label mb-3">
					<span className="label-text font-medium">
						{t("serverTab", "displaySource")}
					</span>
				</div>
				<div className="flex flex-col gap-2">
					{displayOptions.map((opt) => (
						<label
							key={opt.value}
							htmlFor={`display-opt-${opt.value}`}
							className={[
								"flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
								monitorIndex === opt.value
									? "border-primary bg-primary/10"
									: "border-base-300 hover:border-primary/50",
							].join(" ")}
						>
							<input
								id={`display-opt-${opt.value}`}
								type="radio"
								name="display-mode"
								className="radio radio-primary mt-0.5 shrink-0"
								value={opt.value}
								checked={monitorIndex === opt.value}
								onChange={() => setMonitorIndex(opt.value)}
							/>
							<div className="flex-1 min-w-0">
								<div className="font-semibold text-sm wrap-break-word">
									{opt.label}
								</div>
								<div className="text-xs opacity-60 wrap-break-word whitespace-normal">
									{opt.desc}
								</div>
							</div>
						</label>
					))}
				</div>
				{monitorIndex === 1 && (
					<div
						className={[
							"alert alert-info text-xs mt-2 p-3 shadow-sm",
							"wrap-break-word whitespace-normal text-left",
						].join(" ")}
					>
						<span className="wrap-break-word whitespace-normal leading-relaxed">
							{t("serverTab", "displayDriverNotice")}
						</span>
					</div>
				)}
				<p
					className={[
						"text-xs opacity-50 mt-1.5 px-0.5",
						"wrap-break-word whitespace-normal leading-normal",
					].join(" ")}
				>
					{t("serverTab", "displaySourceHelp")}
				</p>
			</div>

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

				<p
					className={[
						"text-xs opacity-50 mt-1.5 px-0.5",
						"break-words whitespace-normal leading-normal",
					].join(" ")}
				>
					{t("serverTab", "lanIpHelp")}
				</p>
			</div>
			<div
				className={[
					"alert alert-warning text-xs shadow-lg",
					"break-words whitespace-normal text-left",
				].join(" ")}
			>
				<TriangleAlert className="w-5 h-5 shrink-0" />
				<span className="break-words whitespace-normal leading-relaxed">
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
			<div
				className={[
					"alert alert-warning text-xs shadow-lg",
					"break-words whitespace-normal text-left",
				].join(" ")}
			>
				<TriangleAlert className="w-5 h-5 shrink-0" />
				<span className="break-words whitespace-normal leading-relaxed">
					{t("serverTab", "restartWarningAlert")}
				</span>
			</div>
			{/* Shared Upload Directory */}
			<div className="form-control w-full">
				<label className="label mb-3" htmlFor="upload-dir-input">
					<span className="label-text font-medium">
						{t("serverTab", "sharedDirectory")}
					</span>
				</label>
				<input
					id="upload-dir-input"
					type="text"
					placeholder={t("serverTab", "sharedDirectoryPlaceholder")}
					className="input input-bordered w-full rounded-md"
					value={uploadDir}
					onChange={(e) => setUploadDir(e.target.value)}
				/>
				<p
					className={[
						"text-xs opacity-50 mt-1.5 px-0.5",
						"break-words whitespace-normal leading-normal",
					].join(" ")}
				>
					{t("serverTab", "sharedDirectoryHelp")}
				</p>
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
