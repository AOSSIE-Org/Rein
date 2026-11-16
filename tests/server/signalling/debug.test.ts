import { IncomingMessage, ServerResponse } from "node:http"
import { Socket } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	handleLogs,
	type DebugHandlerDeps,
} from "@/server/signalling/handlers/debug.ts"

function createDeps(): DebugHandlerDeps {
	return {
		webrtcManager: null,
		getEffectiveHostStatus: () => "stopped",
		lastReportedLatencyMs: { current: null },
		sseClients: new Set<ServerResponse>(),
		logBuffer: [],
	}
}

describe("handleLogs", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps the SSE subscriber until the response closes", () => {
		vi.useFakeTimers()
		const socket = new Socket()
		Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" })
		const req = new IncomingMessage(socket)
		req.url = "/api/debug/logs"
		const res = new ServerResponse(req)
		vi.spyOn(res, "writeHead")
		vi.spyOn(res, "write")
		const deps = createDeps()

		handleLogs(req, res, deps)

		expect(deps.sseClients.has(res)).toBe(true)
		req.emit("close")
		expect(deps.sseClients.has(res)).toBe(true)

		res.emit("close")
		expect(deps.sseClients.has(res)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
		socket.destroy()
	})
})
