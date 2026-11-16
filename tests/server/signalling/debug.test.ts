import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	handleLogs,
	type DebugHandlerDeps,
} from "@/server/signalling/handlers/debug.ts"

class MockRequest extends EventEmitter {
	socket = { remoteAddress: "127.0.0.1" }
	headers = {}
	url = "/api/debug/logs"
}

class MockResponse extends EventEmitter {
	writableEnded = false
	writeHead = vi.fn()
	write = vi.fn()
}

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
		const req = new MockRequest()
		const res = new MockResponse()
		const deps = createDeps()
		const serverResponse = res as unknown as ServerResponse

		handleLogs(req as unknown as IncomingMessage, serverResponse, deps)

		expect(deps.sseClients.has(serverResponse)).toBe(true)
		req.emit("close")
		expect(deps.sseClients.has(serverResponse)).toBe(true)

		res.emit("close")
		expect(deps.sseClients.has(serverResponse)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})
})
