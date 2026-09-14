import { createFileRoute } from "@tanstack/react-router"
import QRCode from "qrcode"
import { useEffect, useRef, useState } from "react"
import { Copy, Check, Link2 } from "lucide-react"
import { ClientTab } from "@/components/settings/ClientTab"
import { ServerTab } from "@/components/settings/ServerTab"
import { APP_CONFIG } from "../config"
import { t } from "../utils/i18n"
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../utils/safeLocalStorage"

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
})

const copyWithFallback = (text: string) => {
	const textArea = document.createElement("textarea")
	textArea.value = text
	textArea.setAttribute("readonly", "")
	textArea.style.position = "absolute"
	textArea.style.left = "-9999px"

	document.body.appendChild(textArea)
	textArea.select()
	textArea.setSelectionRange(0, text.length)

	try {
		return document.execCommand("copy")
	} finally {
		document.body.removeChild(textArea)
	}
}

type SettingsTab = "client" | "server"

function SettingsPage() {
	const [ip, setIp] = useState("")
	const [copied, setCopied] = useState(false)
	const [copyError, setCopyError] = useState("")
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [activeTab, setActiveTab] = useState<SettingsTab>("client")
	const [qrData, setQrData] = useState("")
	const [authToken, setAuthToken] = useState(
		() => getLocalStorageItem("rein_auth_token") || "",
	)

	useEffect(() => {
		return () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
		}
	}, [])

	// Derive URLs once at the top
	const protocol =
		typeof window !== "undefined" ? window.location.protocol : "http:"
	const shareUrl = ip
		? `${protocol}//${ip}:${window.location.port}/trackpad${authToken ? `?token=${encodeURIComponent(authToken)}` : ""}`
		: ""

	useEffect(() => {
		const defaultIp =
			typeof window !== "undefined" ? window.location.hostname : "localhost"
		setIp(defaultIp)
	}, [])

	// Auto-generate token on settings page load (localhost only)
	useEffect(() => {
		if (typeof window === "undefined") return
		const isLocal =
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1" ||
			window.location.hostname === "::1"
		if (!isLocal) return

		let isMounted = true

		fetch("/api/auth/token", { method: "POST" })
			.then((r) => r.json())
			.then((data) => {
				if (isMounted && data.token) {
					setAuthToken(data.token)
					setLocalStorageItem("rein_auth_token", data.token)
				}
			})
			.catch((e) => console.error("Token fetch error:", e))

		return () => {
			isMounted = false
		}
	}, [])

	// Generate QR when IP changes or Token changes
	useEffect(() => {
		if (!ip || typeof window === "undefined" || !shareUrl) return

		QRCode.toDataURL(shareUrl)
			.then(setQrData)
			.catch((e) => console.error("QR Error:", e))
	}, [ip, shareUrl])

	// Effect: Auto-detect LAN IP from Server
	useEffect(() => {
		if (typeof window === "undefined") return
		const isLocal =
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1" ||
			window.location.hostname === "::1"
		if (!isLocal) return

		fetch("/api/host/ip")
			.then((res) => res.json())
			.then((data) => {
				if (data.ip) {
					setIp(data.ip)
				}
			})
			.catch((e) => console.error("IP fetch error:", e))
	}, [])

	return (
		<div className="h-full overflow-y-auto w-full">
			<div className="p-6 pb-safe max-w-5xl mx-auto min-h-full">
				<h1 className="text-3xl font-bold pt-4 mb-6">
					{t("settings", "title")}
				</h1>

				<div className="flex flex-col md:flex-row gap-8 items-start">
					{/* Left Column: Settings Form */}
					<div className="w-full flex-1">
						{/* Tabs */}
						<div
							role="tablist"
							className="flex w-full rounded-lg p-1 mb-6 ml-2 border border-base-300"
						>
							<button
								type="button"
								role="tab"
								id="tab-client"
								aria-selected={activeTab === "client"}
								aria-controls="tabpanel-client"
								className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-all ${
									activeTab === "client"
										? "bg-primary text-primary-content shadow-sm"
										: "text-base-content/70 hover:bg-base-300 hover:text-base-content"
								}`}
								onClick={() => setActiveTab("client")}
							>
								{t("settings", "clientTab")}
							</button>

							<button
								type="button"
								role="tab"
								id="tab-server"
								aria-selected={activeTab === "server"}
								aria-controls="tabpanel-server"
								className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-all ${
									activeTab === "server"
										? "bg-primary text-primary-content shadow-sm"
										: "text-base-content/70 hover:bg-base-300 hover:text-base-content"
								}`}
								onClick={() => setActiveTab("server")}
							>
								{t("settings", "serverTab")}
							</button>
						</div>

						{/* ── CLIENT SETTINGS TAB ── */}
						<div
							id="tabpanel-client"
							role="tabpanel"
							aria-labelledby="tab-client"
							hidden={activeTab !== "client"}
						>
							<ClientTab authToken={authToken} />
						</div>

						{/* ── SERVER SETTINGS TAB ── */}
						<div
							id="tabpanel-server"
							role="tabpanel"
							aria-labelledby="tab-server"
							hidden={activeTab !== "server"}
						>
							<ServerTab ip={ip} setIp={setIp} authToken={authToken} />
						</div>
					</div>

					{/* Right Column: QR Code & Connection Info */}
					<div className="w-full md:w-96 flex-shrink-0">
						<div className="card bg-base-200 shadow-xl sticky top-6">
							<div className="card-body items-center text-center">
								<h2 className="card-title">{t("settings", "connectMobile")}</h2>
								<p className="text-sm opacity-70">{t("settings", "scanQr")}</p>

								{qrData && (
									<div className="bg-white p-4 rounded-xl shadow-inner my-4">
										<img
											src={qrData}
											alt="Connection QR"
											className="w-48 h-48 mix-blend-multiply"
										/>
									</div>
								)}

								<div className="flex flex-col gap-2 mt-2 w-full px-2 items-center">
									{/* URL row: truncated preview + copy button */}
									<div className="flex items-center gap-2 w-full bg-base-100 rounded-2xl px-3 py-2">
										{/* Link icon */}
										<Link2 size={16} className="shrink-0 opacity-50" />
										{/* Truncated URL preview — strips the token query param */}
										<span
											className="flex-1 font-mono text-sm opacity-80 min-w-0"
											style={{
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{ip ? `${ip}:${window.location.port}/trackpad` : ""}
										</span>
										{/* Copy button */}
										<button
											type="button"
											className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
											onClick={async () => {
												setCopyError("")
												try {
													if (
														window.isSecureContext &&
														navigator.clipboard?.writeText
													) {
														await navigator.clipboard.writeText(shareUrl)
													} else if (!copyWithFallback(shareUrl)) {
														throw new Error("Clipboard copy failed")
													}
													setCopied(true)
													if (copyTimerRef.current)
														clearTimeout(copyTimerRef.current)
													copyTimerRef.current = setTimeout(() => {
														setCopied(false)
														copyTimerRef.current = null
													}, 1500)
												} catch (err) {
													console.error("Failed to copy URL:", err)
													if (copyTimerRef.current) {
														clearTimeout(copyTimerRef.current)
														copyTimerRef.current = null
													}
													setCopied(false)
													setCopyError(t("settings", "copyFailed"))
												}
											}}
										>
											{copied ? <Check size={16} /> : <Copy size={16} />}
											{copied ? t("settings", "copied") : t("settings", "copy")}
										</button>
									</div>
									{copyError && (
										<p className="text-error text-xs text-center max-w-xs">
											{copyError}
										</p>
									)}
								</div>
							</div>
						</div>

						<div className="text-xs text-center opacity-50 pt-8 pb-8">
							{t("settings", "appVersion", { version: APP_CONFIG.VERSION })}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
