import { createFileRoute } from "@tanstack/react-router"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { APP_CONFIG, THEMES } from "../config"
import serverConfig from "../server-config.json"

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
})

function SettingsPage() {
	const [ip, setIp] = useState("")
	const [frontendPort, setFrontendPort] = useState(
		String(serverConfig.frontendPort),
	)
	const [originalPort] = useState(String(serverConfig.frontendPort))

	const serverConfigChanged = frontendPort !== originalPort

	// Client Side Settings (LocalStorage)
	const [invertScroll, setInvertScroll] = useState(() => {
		if (typeof window === "undefined") return false
		try {
			const saved = localStorage.getItem("rein_invert")
			return saved === "true"
		} catch {
			return false
		}
	})

	const [sensitivity, setSensitivity] = useState(() => {
		if (typeof window === "undefined") return 1.0
		const saved = localStorage.getItem("rein_sensitivity")
		const parsed = saved ? Number.parseFloat(saved) : Number.NaN
		return Number.isFinite(parsed) ? parsed : 1.0
	})

	const [theme, setTheme] = useState(() => {
		if (typeof window === "undefined") return THEMES.DEFAULT
		try {
			const saved = localStorage.getItem(APP_CONFIG.THEME_STORAGE_KEY)
			return saved === THEMES.LIGHT || saved === THEMES.DARK
				? saved
				: THEMES.DEFAULT
		} catch {
			return THEMES.DEFAULT
		}
	})

	const [qrData, setQrData] = useState("")

	// Load initial state (IP is not stored in localStorage; only sensitivity, invert, theme are client settings)
	const [authToken, setAuthToken] = useState(() => {
		if (typeof window === "undefined") return ""
		return localStorage.getItem("rein_auth_token") || ""
	})

	// Derive URLs once at the top
	const appPort = String(frontendPort)
	const protocol =
		typeof window !== "undefined" ? window.location.protocol : "http:"
	const shareUrl = ip
		? `${protocol}//${ip}:${appPort}/trackpad${authToken ? `?token=${encodeURIComponent(authToken)}` : ""}`
		: ""

	useEffect(() => {
		const defaultIp =
			typeof window !== "undefined" ? window.location.hostname : "localhost"
		setIp(defaultIp)
		setFrontendPort(String(serverConfig.frontendPort))
	}, [])

	// Auto-generate token on settings page load (localhost only)
	useEffect(() => {
		if (typeof window === "undefined") return

		let isMounted = true

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const wsUrl = `${protocol}//${window.location.host}/ws`
		const socket = new WebSocket(wsUrl)

		socket.onopen = () => {
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: "generate-token" }))
			}
		}

		socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data)
				if (data.type === "token-generated" && data.token) {
					if (isMounted) {
						setAuthToken(data.token)
						localStorage.setItem("rein_auth_token", data.token)
					}
					socket.close()
				}
			} catch (e) {
				console.error(e)
			}
		}

		return () => {
			isMounted = false
			if (
				socket.readyState === WebSocket.OPEN ||
				socket.readyState === WebSocket.CONNECTING
			) {
				socket.close()
			}
		}
	}, [])

	// Effect: Update LocalStorage when settings change
	useEffect(() => {
		localStorage.setItem("rein_sensitivity", String(sensitivity))
	}, [sensitivity])

	useEffect(() => {
		localStorage.setItem("rein_invert", JSON.stringify(invertScroll))
	}, [invertScroll])

	// Effect: Theme
	useEffect(() => {
		if (typeof window === "undefined") return
		localStorage.setItem(APP_CONFIG.THEME_STORAGE_KEY, theme)
		document.documentElement.setAttribute("data-theme", theme)
	}, [theme])

	// Generate QR when IP changes or Token changes
	useEffect(() => {
		if (!ip || typeof window === "undefined" || !shareUrl) return

		QRCode.toDataURL(shareUrl)
			.then(setQrData)
			.catch((e) => console.error("QR Error:", e))
	}, [ip, shareUrl])

	// Effect: Auto-detect LAN IP from Server (only if on localhost)
	useEffect(() => {
		if (typeof window === "undefined") return
		if (window.location.hostname !== "localhost") return

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const wsUrl = `${protocol}//${window.location.host}/ws`
		const socket = new WebSocket(wsUrl)

		socket.onopen = () => {
			socket.send(JSON.stringify({ type: "get-ip" }))
		}

		socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data)
				if (data.type === "server-ip" && data.ip) {
					setIp(data.ip)
					socket.close()
				}
			} catch (e) {
				console.error(e)
			}
		}

		return () => {
			if (socket.readyState === WebSocket.OPEN) socket.close()
		}
	}, [])

	return (
		<div className="h-full overflow-y-auto w-full">
			<div className="p-6 pb-safe max-w-5xl mx-auto min-h-full">
				<h1 className="text-3xl font-bold pt-4 mb-8">Settings</h1>

				<div className="flex flex-col md:flex-row gap-8 items-start">
					{/* Left Column: Settings Form */}
					<div className="w-full flex-1 space-y-8">
						<h2 className="text-xl font-semibold">Client Settings</h2>

						<div className="form-control w-full">
							<label className="label mb-3" htmlFor="sensitivity-slider">
								<span className="label-text">Mouse Sensitivity</span>
								<span className="label-text-alt font-mono">
									{sensitivity.toFixed(1)}x
								</span>
							</label>

							<input
								type="range"
								id="sensitivity-slider"
								min="0.1"
								max="3.0"
								step="0.1"
								value={sensitivity}
								onChange={(e) =>
									setSensitivity(Number.parseFloat(e.target.value))
								}
								className="range range-primary range-sm w-full"
							/>

							<div className="mt-2 flex w-full justify-between px-2 text-xs opacity-50">
								<span>Slow</span>
								<span>Default</span>
								<span>Fast</span>
							</div>
						</div>

						<div className="form-control w-full">
							<label
								className="label cursor-pointer"
								htmlFor="invert-scroll-toggle"
							>
								<span className="label-text font-medium">Invert Scroll</span>
								<input
									id="invert-scroll-toggle"
									type="checkbox"
									className="toggle toggle-primary"
									checked={invertScroll}
									onChange={(e) => setInvertScroll(e.target.checked)}
								/>
							</label>

							<label className="label" htmlFor="invert-scroll-toggle">
								<span className="label-text-alt opacity-50">
									{invertScroll
										? "Traditional scrolling enabled"
										: "Natural scrolling"}
								</span>
							</label>
						</div>

						<div className="form-control w-full">
							<label className="label mb-3" htmlFor="theme-select">
								<span className="label-text">Theme</span>
							</label>
							<select
								id="theme-select"
								className="select select-bordered w-full rounded-md"
								value={theme}
								onChange={(e) => setTheme(e.target.value)}
							>
								<option value={THEMES.DARK}>Dark</option>
								<option value={THEMES.LIGHT}>Light</option>
							</select>
						</div>

						<div className="divider" />

						<h2 className="text-xl font-semibold">Server Settings</h2>

						<div className="form-control w-full">
							<label className="label mb-3" htmlFor="server-ip-input">
								<span className="label-text">Server IP (for Remote)</span>
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
									This Computer's LAN IP
								</span>
							</label>
						</div>

						<div className="form-control w-full">
							<label className="label mb-3" htmlFor="port-input">
								<span className="label-text">Port</span>
							</label>
							<input
								id="port-input"
								type="text"
								placeholder={String(serverConfig.frontendPort)}
								className="input input-bordered w-full rounded-md"
								value={frontendPort}
								onChange={(e) => setFrontendPort(e.target.value)}
							/>
						</div>

						<div className="alert alert-warning text-xs shadow-lg">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="stroke-current shrink-0 h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
							>
								<title>Warning</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<span>
								Important: Ensure port {frontendPort} is allowed in your
								computer's firewall!
							</span>
						</div>

						<button
							type="button"
							className="btn btn-primary w-full rounded-md"
							disabled={!serverConfigChanged}
							onClick={() => {
								const port = Number.parseInt(frontendPort, 10)
								if (!Number.isFinite(port) || port < 1 || port > 65535) {
									alert("Please enter a valid port number (1–65535).")
									return
								}

								const protocol =
									window.location.protocol === "https:" ? "wss:" : "ws:"
								const host = window.location.host
								const wsUrl = `${protocol}//${host}/ws`
								const socket = new WebSocket(wsUrl)

								socket.onerror = () => {
									alert("Failed to connect to the server.")
								}

								socket.onopen = () => {
									socket.send(
										JSON.stringify({
											type: "update-config",
											config: {
												frontendPort: port,
											},
										}),
									)

									setTimeout(() => {
										socket.close()
										const newProtocol = window.location.protocol
										const newHostname = window.location.hostname
										const newUrl = `${newProtocol}//${newHostname}:${frontendPort}/settings`
										window.location.href = newUrl
									}, 1000)
								}
							}}
						>
							Save Config
						</button>
					</div>

					{/* Right Column: QR Code & Connection Info */}
					<div className="w-full md:w-96 flex-shrink-0">
						<div className="card bg-base-200 shadow-xl sticky top-6">
							<div className="card-body items-center text-center">
								<h2 className="card-title">Connect Mobile</h2>
								<p className="text-sm opacity-70">Scan to open remote</p>

								{qrData && (
									<div className="bg-white p-4 rounded-xl shadow-inner my-4">
										<img
											src={qrData}
											alt="Connection QR"
											className="w-48 h-48 mix-blend-multiply"
										/>
									</div>
								)}

								<a
									className="link link-primary mt-2 break-all text-lg font-mono bg-base-100 px-4 py-2 rounded-lg inline-block max-w-full overflow-hidden text-ellipsis"
									href={shareUrl}
								>
									{shareUrl.replace(`${protocol}//`, "")}
								</a>
							</div>
						</div>

						<div className="text-xs text-center opacity-50 pt-8 pb-8">
							Rein Remote v1.0.0
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
