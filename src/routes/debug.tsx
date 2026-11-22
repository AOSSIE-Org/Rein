import { createFileRoute } from "@tanstack/react-router"
import { Terminal, Trash2, Wifi, Users } from "lucide-react"
import { useEffect, useRef, useState, useCallback } from "react"
import {
	ComposedChart,
	Area,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts"
import { useClientLogs } from "../contexts/DebugContext"
import { t } from "../utils/i18n"

export const Route = createFileRoute("/debug")({
	component: DebugScreen,
})
type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG"

interface ServerLogEntry {
	id: string
	timestamp: string
	level: LogLevel
	message: string
}

interface TelemetryPoint {
	t: string
	recvKBps: number
	sentKBps: number
	latencyMs: number
}

interface SessionInfo {
	id: string
	state: string
	createdAt: number
	/** True when the client's session-sse SSE stream is currently connected. */
	hasSseConnection: boolean
	hasInputConnection: boolean
	bytesRecv: number
	bytesSent: number
}

interface ServerState {
	hostStatus: "stopped" | "starting" | "running" | "error"
	sessionCount: number
	sessions: SessionInfo[]
	inputConnectionCount: number
	latencyMs: number | null
}
function nowLabel(): string {
	const d = new Date()
	return `${d.getHours().toString().padStart(2, "0")}:${d
		.getMinutes()
		.toString()
		.padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
}

function fmtAge(createdAt: number): string {
	const s = Math.floor((Date.now() - createdAt) / 1000)
	if (s < 60) return t("debug", "secondsAgo", { s })
	if (s < 3600) return t("debug", "minutesAgo", { m: Math.floor(s / 60) })
	return t("debug", "hoursAgo", { h: Math.floor(s / 3600) })
}

function DebugScreen() {
	const { clientLogs, clearClientLogs } = useClientLogs()
	const [serverState, setServerState] = useState<ServerState>({
		hostStatus: "stopped",
		sessionCount: 0,
		sessions: [],
		inputConnectionCount: 0,
		latencyMs: null,
	})
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	)

	const fetchServerState = useCallback(async () => {
		try {
			const res = await fetch("/api/debug/sessions")
			if (!res.ok) return
			const data = (await res.json()) as ServerState
			setServerState(data)
		} catch {}
	}, [])

	useEffect(() => {
		fetchServerState()
		const id = setInterval(fetchServerState, 1000)
		return () => clearInterval(id)
	}, [fetchServerState])
	const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([])
	const [_sseConnected, setSseConnected] = useState(false)
	const serverLogIdRef = useRef(0)

	useEffect(() => {
		const sse = new EventSource("/api/debug/logs")
		sse.onopen = () => setSseConnected(true)
		sse.onmessage = (event) => {
			try {
				const raw = JSON.parse(event.data) as {
					timestamp?: string
					level?: string
					message?: string
				}
				const entry: ServerLogEntry = {
					id: `sl-${++serverLogIdRef.current}`,
					timestamp: raw.timestamp ?? "",
					level: ((raw.level ?? "INFO") as string).toUpperCase() as LogLevel,
					message: raw.message ?? "",
				}
				setServerLogs((prev) => {
					const next = [...prev, entry]
					return next.length > 500 ? next.slice(-500) : next
				})
			} catch {}
		}
		sse.onerror = () => setSseConnected(false)
		return () => sse.close()
	}, [])
	const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(
		() => [{ t: nowLabel(), recvKBps: 0, sentKBps: 0, latencyMs: 0 }],
	)
	const prevBytesRef = useRef({ recv: 0, sent: 0 })
	// biome-ignore lint/correctness/useExhaustiveDependencies: selectedSessionId is a change-trigger, not read inside — intentional reset-on-change pattern
	useEffect(() => {
		prevBytesRef.current = { recv: 0, sent: 0 }
		setTelemetryHistory([
			{ t: nowLabel(), recvKBps: 0, sentKBps: 0, latencyMs: 0 },
		])
	}, [selectedSessionId])
	const serverStateRef = useRef(serverState)
	useEffect(() => {
		serverStateRef.current = serverState
	}, [serverState])

	useEffect(() => {
		const id = setInterval(() => {
			const current = serverStateRef.current
			const src = selectedSessionId
				? current.sessions.filter((s) => s.id === selectedSessionId)
				: current.sessions
			const totalRecv = src.reduce((sum, s) => sum + (s.bytesRecv ?? 0), 0)
			const totalSent = src.reduce((sum, s) => sum + (s.bytesSent ?? 0), 0)
			const deltaRecv =
				Math.max(0, totalRecv - prevBytesRef.current.recv) / 1024
			const deltaSent =
				Math.max(0, totalSent - prevBytesRef.current.sent) / 1024
			prevBytesRef.current = { recv: totalRecv, sent: totalSent }

			setTelemetryHistory((prev) => {
				const next = [
					...prev,
					{
						t: nowLabel(),
						recvKBps: Math.round(deltaRecv * 10) / 10,
						sentKBps: Math.round(deltaSent * 10) / 10,
						latencyMs: current.latencyMs ?? 0,
					},
				]
				return next.length > 60 ? next.slice(-60) : next
			})
		}, 1000)
		return () => clearInterval(id)
	}, [selectedSessionId])

	const [consoleTab, setConsoleTab] = useState<"server" | "client">("server")
	const [levelFilter, setLevelFilter] = useState("ALL")
	const [searchQuery, setSearchQuery] = useState("")
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const logEndRef = useRef<HTMLDivElement>(null)
	const copyToClipboard = (id: string, text: string) => {
		const done = () => {
			setCopiedId(id)
			setTimeout(() => setCopiedId(null), 1500)
		}
		if (navigator.clipboard) {
			navigator.clipboard
				.writeText(text)
				.then(done)
				.catch(() => {})
		} else {
			const el = document.createElement("textarea")
			el.value = text
			el.style.position = "fixed"
			el.style.opacity = "0"
			document.body.appendChild(el)
			el.focus()
			el.select()
			try {
				document.execCommand("copy")
				done()
			} catch {
				/* silent */
			}
			document.body.removeChild(el)
		}
	}

	const activeLogs = consoleTab === "server" ? serverLogs : clientLogs

	const filteredLogs = activeLogs.filter((log) => {
		const matchLevel = levelFilter === "ALL" || log.level === levelFilter
		const matchSearch =
			searchQuery === "" ||
			log.message.toLowerCase().includes(searchQuery.toLowerCase())
		return matchLevel && matchSearch
	})

	const levelClass = (level: string) => {
		switch (level) {
			case "WARN":
				return "bg-amber-950 text-amber-400 border border-amber-800/60"
			case "ERROR":
				return "bg-red-950 text-red-400 border border-red-800/60"
			default:
				return "bg-blue-950 text-blue-400 border border-blue-800/60"
		}
	}

	const hostStatusLabels: Record<ServerState["hostStatus"], string> = {
		stopped: t("debug", "statusStopped"),
		starting: t("debug", "statusStarting"),
		running: t("debug", "statusRunning"),
		error: t("debug", "statusError"),
	}

	const sessionStateLabels: Record<string, string> = {
		connected: t("debug", "sessionConnected"),
		answered: t("debug", "sessionAnswered"),
		offering: t("debug", "sessionOffering"),
	}

	const hostStatusCls = {
		running: "text-success",
		starting: "text-warning",
		stopped: "text-base-content/50",
		error: "text-error",
	}[serverState.hostStatus]
	const latest = telemetryHistory[telemetryHistory.length - 1]

	const maxRecv = Math.max(...telemetryHistory.map((p) => p.recvKBps), 0.01)
	const maxLat = Math.max(...telemetryHistory.map((p) => p.latencyMs), 1)
	const maxSent = Math.max(...telemetryHistory.map((p) => p.sentKBps), 0.01)

	const chartData = telemetryHistory.map((p) => ({
		t: p.t,
		recvNorm: Math.round((p.recvKBps / maxRecv) * 100),
		latNorm: Math.round((p.latencyMs / maxLat) * 100),
		sentNorm: Math.round((p.sentKBps / maxSent) * 100),
		recvKBps: p.recvKBps,
		latencyMs: p.latencyMs,
		sentKBps: p.sentKBps,
	}))

	const latColor =
		(latest?.latencyMs ?? 0) < 50
			? "text-emerald-400"
			: (latest?.latencyMs ?? 0) < 120
				? "text-amber-400"
				: "text-red-400"

	return (
		<div className="h-full w-full overflow-y-auto bg-base-300 text-base-content p-4 md:p-6 font-sans text-xs space-y-5">
			<div className="max-w-7xl mx-auto space-y-5">
				{/* Header */}
				{/* Server status summary row */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
					{[
						{
							label: t("debug", "gstreamer"),
							value: hostStatusLabels[serverState.hostStatus],
							cls: hostStatusCls,
						},
						{
							label: t("debug", "activeSessions"),
							value: String(serverState.sessionCount),
							cls: serverState.sessionCount > 0 ? "text-success" : "",
						},
						{
							label: t("debug", "viewersSse"),
							value: String(
								serverState.sessions.filter((s) => s.hasSseConnection).length,
							),
							cls: serverState.sessions.some((s) => s.hasSseConnection)
								? "text-success"
								: "",
						},
						{
							label: t("debug", "inputChannels"),
							value: String(serverState.inputConnectionCount),
							cls: serverState.inputConnectionCount > 0 ? "text-success" : "",
						},
					].map(({ label, value, cls }) => (
						<div
							key={label}
							className="bg-base-100 border border-base-200 rounded p-3"
						>
							<div className="text-base-content/60 text-[11px] mb-1">
								{label}
							</div>
							<div className={`font-semibold capitalize ${cls}`}>{value}</div>
						</div>
					))}
				</div>

				{/* Telemetry + Connection panels */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
					{/* Telemetry chart */}
					<div className="lg:col-span-2 bg-base-100 border border-base-200 rounded p-5 flex flex-col gap-3">
						{/* Header row */}
						<div className="flex items-center gap-2 flex-wrap">
							<Wifi className="w-4 h-4 text-primary" />
							<h2 className="font-bold text-sm">{t("debug", "network")}</h2>
							<span className="ml-auto text-[10px] text-base-content/30 font-mono">
								{selectedSessionId
									? selectedSessionId
									: t("debug", "allSessions")}
							</span>
						</div>
						{/* Live-value strip */}
						<div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
							{/* Latency */}
							<div className="bg-base-200 rounded px-3 py-2 border border-base-300 flex flex-col gap-0.5">
								<span className="text-[10px] text-base-content/50 flex items-center gap-1">
									<span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
									{t("debug", "latency")}
								</span>
								<span className={`text-base font-bold ${latColor}`}>
									{t("debug", "latencyMs", { ms: latest?.latencyMs ?? 0 })}
								</span>
								<span className="text-[9px] text-base-content/30">
									{t("debug", "peakMs", { ms: maxLat })}
								</span>
							</div>
							{/* Video recv */}
							<div className="bg-base-200 rounded px-3 py-2 border border-base-300 flex flex-col gap-0.5">
								<span className="text-[10px] text-base-content/50 flex items-center gap-1">
									<span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
									{t("debug", "videoRecv")}
								</span>
								<span className="text-base font-bold text-cyan-400">
									{t("debug", "kbpsValue", { val: latest?.recvKBps ?? 0 })}
								</span>
								<span className="text-[9px] text-base-content/30">
									{t("debug", "peakKbps", { val: maxRecv.toFixed(1) })}
								</span>
							</div>
							{/* Input sent */}
							<div className="bg-base-200 rounded px-3 py-2 border border-base-300 flex flex-col gap-0.5">
								<span className="text-[10px] text-base-content/50 flex items-center gap-1">
									<span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
									{t("debug", "inputSent")}
								</span>
								<span className="text-base font-bold text-violet-400">
									{t("debug", "kbpsValue", { val: latest?.sentKBps ?? 0 })}
								</span>
								<span className="text-[9px] text-base-content/30">
									{t("debug", "peakKbps", { val: maxSent.toFixed(1) })}
								</span>
							</div>
						</div>

						{/* Normalised chart */}
						<div className="h-40 w-full">
							<ResponsiveContainer width="100%" height="100%">
								<ComposedChart
									data={chartData}
									margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
								>
									<defs>
										<linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1">
											<stop
												offset="5%"
												stopColor="#22d3ee"
												stopOpacity={0.25}
											/>
											<stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
										</linearGradient>
										<linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
											<stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
										</linearGradient>
									</defs>

									<CartesianGrid
										strokeDasharray="3 3"
										stroke="oklch(var(--b3) / 0.4)"
									/>
									<XAxis
										dataKey="t"
										tick={{ fontSize: 8, fill: "white" }}
										interval="preserveStartEnd"
									/>
									{/* Single normalised 0-100% Y-axis */}
									<YAxis
										color="white"
										domain={[0, 100]}
										tickCount={5}
										width={38}
									/>
									<Tooltip
										contentStyle={{
											background: "oklch(var(--b2))",
											border: "1px solid oklch(var(--b3))",
											borderRadius: 6,
											fontSize: 11,
										}}
										content={({ active, payload }) => {
											if (!active || !payload?.length) return null
											const d = payload[0].payload as (typeof chartData)[0]
											return (
												<div
													style={{
														background: "oklch(var(--b2))",
														border: "1px solid oklch(var(--b3))",
														borderRadius: 6,
														padding: "6px 10px",
														fontFamily: "monospace",
														fontSize: 11,
														lineHeight: 1.7,
													}}
												>
													<div className="text-base-content/50 mb-1">{d.t}</div>
													<div style={{ color: "#fb923c" }}>
														{t("debug", "latency")}:{" "}
														<strong>
															{t("debug", "latencyMs", { ms: d.latencyMs })}
														</strong>
													</div>
													<div style={{ color: "#22d3ee" }}>
														{t("debug", "videoRecv")}:{" "}
														<strong>
															{t("debug", "kbpsValue", { val: d.recvKBps })}
														</strong>
													</div>
													<div style={{ color: "#a78bfa" }}>
														{t("debug", "inputSent")}:{" "}
														<strong>
															{t("debug", "kbpsValue", { val: d.sentKBps })}
														</strong>
													</div>
												</div>
											)
										}}
									/>
									{/* Latency — orange line, most important */}
									<Line
										type="monotone"
										dataKey="latNorm"
										name={t("debug", "latency")}
										stroke="#fb923c"
										strokeWidth={2}
										dot={false}
										isAnimationActive={false}
									/>
									{/* Video recv — cyan area */}
									<Area
										type="monotone"
										dataKey="recvNorm"
										name={t("debug", "videoRecv")}
										stroke="#22d3ee"
										strokeWidth={1.5}
										fill="url(#gRecv)"
										dot={false}
										isAnimationActive={false}
									/>
									{/* Input sent — violet area */}
									<Area
										type="monotone"
										dataKey="sentNorm"
										name={t("debug", "inputSent")}
										stroke="#a78bfa"
										strokeWidth={1.5}
										fill="url(#gSent)"
										dot={false}
										isAnimationActive={false}
									/>
								</ComposedChart>
							</ResponsiveContainer>
						</div>
					</div>

					{/* Live sessions sidebar */}
					<div className="bg-base-100 border border-base-200 rounded p-5 flex flex-col gap-3">
						<div className="flex items-center gap-2 mb-1">
							<Users className="w-4 h-4 text-secondary" />
							<h2 className="font-bold text-sm">
								{t("debug", "clientSessions")}
							</h2>
						</div>

						<div className="font-mono text-[11px] flex-1 space-y-2 space-x-2 overflow-y-auto max-h-72">
							{serverState.sessions.length === 0 ? (
								<div className="text-base-content/30 text-center py-8 italic font-sans text-xs">
									{t("debug", "noActiveSessions")}
								</div>
							) : (
								serverState.sessions.map((session) => {
									const isSelected = selectedSessionId === session.id
									return (
										<button
											key={session.id}
											type="button"
											onClick={() => {
												const next = isSelected ? null : session.id
												setSelectedSessionId(next)
												setSearchQuery(next ? next.slice(0, 8) : "")
											}}
											className={`p-2.5 rounded flex-1 flex-col border space-y-1 cursor-pointer transition-colors ${
												isSelected
													? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
													: "bg-base-200 border-base-300 hover:border-base-content/20"
											}`}
										>
											<div className="flex items-center gap-1.5 flex-wrap">
												<span
													className={`font-bold truncate ${isSelected ? "text-primary" : "text-base-content/70"}`}
													title={session.id}
												>
													{session.id.slice(0, 8)}…
												</span>
												<span
													className={`px-1.5 rounded text-[9px] font-bold border ${
														session.state === "connected"
															? "bg-green-950 text-green-400 border-green-800/60"
															: session.state === "answered" ||
																	session.state === "offering"
																? "bg-blue-950 text-blue-400 border-blue-800/60"
																: "bg-neutral-800 text-neutral-300 border-neutral-700"
													}`}
												>
													{sessionStateLabels[session.state] ?? session.state}
												</span>
											</div>
											<div className="grid grid-cols-2 gap-1 text-[10px]">
												<div className="text-base-content/60">
													{t("debug", "wsPeers")}:{" "}
													<span
														className={
															session.hasSseConnection
																? "text-success font-bold"
																: "text-base-content/40"
														}
													>
														{session.hasSseConnection
															? t("debug", "yes")
															: t("debug", "no")}
													</span>
												</div>
												<div className="text-base-content/60">
													{t("debug", "inputDc")}:{" "}
													<span
														className={
															session.hasInputConnection
																? "text-success font-bold"
																: "text-base-content/40"
														}
													>
														{session.hasInputConnection
															? t("debug", "dcOpen")
															: t("debug", "dcNone")}
													</span>
												</div>
												<div className="text-base-content/40 col-span-2">
													{fmtAge(session.createdAt)}
												</div>
											</div>
										</button>
									)
								})
							)}
						</div>
					</div>
				</div>

				{/* Log Console */}
				<div className="bg-base-100 border border-base-200 rounded p-5">
					{/* Toolbar */}
					<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-base-200">
						<div className="flex items-center gap-2 flex-wrap">
							<Terminal className="w-4 h-4 text-primary shrink-0" />
							<span className="font-bold text-sm">
								{t("debug", "logConsole")}
							</span>
							<div className="join border border-base-300 rounded overflow-hidden font-mono text-[11px]">
								<button
									type="button"
									onClick={() => setConsoleTab("server")}
									className={`join-item btn btn-xs px-3 border-none ${consoleTab === "server" ? "btn-primary" : "btn-ghost"}`}
								>
									{t("debug", "serverTab", { count: serverLogs.length })}
								</button>
								<button
									type="button"
									onClick={() => setConsoleTab("client")}
									className={`join-item btn btn-xs px-3 border-none ${consoleTab === "client" ? "btn-primary" : "btn-ghost"}`}
								>
									{t("debug", "clientTab", { count: clientLogs.length })}
								</button>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
							<div className="relative">
								<input
									type="text"
									placeholder={t("debug", "filterPlaceholder")}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="input input-xs input-bordered pl-8 w-36 sm:w-44 font-mono text-[11px] rounded"
								/>
							</div>

							<div className="join border border-base-300 rounded overflow-hidden">
								{(["ALL", "INFO", "WARN", "ERROR"] as const).map((lvl) => {
									const levelLabels: Record<string, string> = {
										ALL: t("debug", "filterAll"),
										INFO: t("debug", "filterInfo"),
										WARN: t("debug", "filterWarn"),
										ERROR: t("debug", "filterError"),
									}
									return (
										<button
											key={lvl}
											type="button"
											onClick={() => setLevelFilter(lvl)}
											className={`join-item btn btn-xs font-mono text-[10px] px-2 border-none ${levelFilter === lvl ? "btn-neutral" : "btn-ghost text-base-content/70"}`}
										>
											{levelLabels[lvl]}
										</button>
									)
								})}
							</div>
							<button
								type="button"
								className="btn btn-xs btn-ghost text-error rounded"
								onClick={() => {
									if (consoleTab === "server") setServerLogs([])
									else clearClientLogs()
								}}
							>
								<Trash2 className="w-3.5 h-3.5" />
								{t("debug", "clear")}
							</button>
						</div>
					</div>

					{/* Log viewport */}
					<div className="bg-[#0d1117] text-neutral-200 rounded border border-neutral-800 p-4 font-mono text-[11px] overflow-y-auto max-h-96 space-y-1.5">
						{filteredLogs.length === 0 ? (
							<div className="text-neutral-500 text-center py-16 italic font-sans text-xs">
								{t("debug", "noLogRecords")}
							</div>
						) : (
							filteredLogs.map((log) => (
								<button
									key={log.id}
									type="button"
									className="group flex flex-col sm:flex-row sm:items-start gap-2 hover:bg-white/5 py-0.5 px-1 rounded"
									onClick={() =>
										copyToClipboard(
											log.id,
											"details" in log && (log as { details?: string }).details
												? `${log.message}\n${(log as { details: string }).details}`
												: log.message,
										)
									}
								>
									<span className="text-neutral-500 shrink-0 select-none">
										[{log.timestamp}]
									</span>
									<span
										className={`px-1.5 rounded text-[10px] font-bold shrink-0 ${levelClass(log.level)}`}
									>
										{log.level}
									</span>
									{"source" in log && (
										<span className="text-emerald-400/80 shrink-0 font-semibold">
											[{(log as { source: string }).source}]
										</span>
									)}
									<div className="flex-1 break-all text-neutral-300">
										{log.message}
										{"details" in log &&
											(log as { details?: string }).details && (
												<div className="text-neutral-400 text-[10px] mt-0.5 pl-2 border-l border-neutral-700">
													{(log as { details: string }).details}
												</div>
											)}
									</div>
									{copiedId === log.id && (
										<span className="text-[10px] text-success font-semibold shrink-0">
											{t("debug", "copied")}
										</span>
									)}
								</button>
							))
						)}
						<div ref={logEndRef} />
					</div>
				</div>
			</div>
		</div>
	)
}
