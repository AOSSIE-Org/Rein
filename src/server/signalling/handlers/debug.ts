import type { IncomingMessage, ServerResponse } from "node:http"
import type { WebRTCManager } from "../webRTC.ts"
import { requireAuth, parseJsonBody, json } from "../utils.ts"

// Shared mutable state injected from server.ts
export interface DebugHandlerDeps {
	webrtcManager: WebRTCManager | null
	getEffectiveHostStatus: () => "stopped" | "starting" | "running" | "error"
	lastReportedLatencyMs: { current: number | null }
	sseClients: Set<ServerResponse>
	logBuffer: string[]
}

export function handleSessions(
	req: IncomingMessage,
	res: ServerResponse,
	deps: DebugHandlerDeps,
): void {
	if (!requireAuth(req, res)) return
	const sessions = deps.webrtcManager?.getSessions() ?? []
	json(res, 200, {
		hostStatus: deps.getEffectiveHostStatus(),
		sessionCount: sessions.length,
		sessions,
		inputConnectionCount: sessions.filter((s) => s.hasInputConnection).length,
		latencyMs: deps.lastReportedLatencyMs.current,
	})
}

export function handleLatency(
	req: IncomingMessage,
	res: ServerResponse,
	deps: DebugHandlerDeps,
): void {
	if (!requireAuth(req, res)) return
	parseJsonBody<{ latencyMs?: number }>(req)
		.then((body) => {
			if (typeof body.latencyMs === "number" && body.latencyMs >= 0) {
				deps.lastReportedLatencyMs.current = body.latencyMs
			}
			json(res, 200, { ok: true })
		})
		.catch(() => json(res, 400, { ok: false }))
}

export function handleLogs(
	req: IncomingMessage,
	res: ServerResponse,
	deps: DebugHandlerDeps,
): void {
	if (!requireAuth(req, res)) return
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	})
	res.write(": connected\n\n")
	// Replay buffered logs so the client sees history from before opening /debug
	for (const entry of deps.logBuffer) {
		try {
			res.write(entry)
		} catch {
			/* client gone already */
		}
	}
	deps.sseClients.add(res)
	const keepAliveTimer = setInterval(() => {
		try {
			res.write(": keep-alive\n\n")
		} catch {
			deps.sseClients.delete(res)
			clearInterval(keepAliveTimer)
		}
	}, 15_000)
	const cleanupSse = () => {
		deps.sseClients.delete(res)
		clearInterval(keepAliveTimer)
	}
	req.on("close", cleanupSse)
	req.on("error", cleanupSse)
}
