import { EventEmitter } from "node:events"
import type { ServerResponse } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	attachSessionSse,
	cleanupSession,
	pushSessionEvent,
	snapshotSessions,
	type ClientSession,
} from "./sessionStore.ts"

vi.mock("../../../utils/logger.ts", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

class FakeResponse extends EventEmitter {
	writableEnded = false
	writes: string[] = []

	writeHead(_status: number): this {
		return this
	}

	write(chunk: string): boolean {
		this.writes.push(chunk)
		return true
	}

	end(): this {
		this.writableEnded = true
		this.emit("close")
		return this
	}
}

function makeSession(): ClientSession {
	return {
		pc: {
			iceConnectionState: "connected",
			close: vi.fn(),
		} as unknown as ClientSession["pc"],
		videoTrack: {} as ClientSession["videoTrack"],
		audioTrack: {} as ClientSession["audioTrack"],
		inputHandler: { destroy: vi.fn() } as unknown as ClientSession["inputHandler"],
		sessionId: "session-1",
		bytesRecv: 12,
		bytesSent: 34,
		dcUnordered: { readyState: "open" } as ClientSession["dcUnordered"],
		dcOrdered: { readyState: "closed" } as ClientSession["dcOrdered"],
		sessionSseRes: null,
		pendingEvents: [],
		disconnectTimer: null,
		createdAt: 1234,
	}
}

describe("sessionStore lifecycle and SSE delivery", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("buffers events until an SSE response is attached", () => {
		const client = makeSession()
		const clients = new Map([["session-1", client]])
		const event = { type: "error" as const, errorType: "ice", message: "lost" }

		pushSessionEvent(clients, "missing", event)
		expect(client.pendingEvents).toEqual([])

		pushSessionEvent(clients, "session-1", event)
		expect(client.pendingEvents).toEqual([event])
	})

	it("sends events directly to an active SSE response", () => {
		const client = makeSession()
		const response = new FakeResponse()
		client.sessionSseRes = response as unknown as ServerResponse
		const clients = new Map([["session-1", client]])
		const event = {
			type: "ice" as const,
			candidate: { candidate: "candidate:1" },
		}

		pushSessionEvent(clients, "session-1", event)

		expect(response.writes).toEqual([
			"data: " + JSON.stringify(event) + "\n\n",
		])
		expect(client.pendingEvents).toEqual([])
	})

	it("re-buffers the event if writing to the SSE response throws", () => {
		const client = makeSession()
		const response = new FakeResponse()
		vi.spyOn(response, "write").mockImplementation(() => {
			throw new Error("connection closed")
		})
		client.sessionSseRes = response as unknown as ServerResponse
		const event = { type: "error" as const, errorType: "network", message: "x" }

		pushSessionEvent(new Map([["session-1", client]]), "session-1", event)

		expect(client.sessionSseRes).toBeNull()
		expect(client.pendingEvents).toEqual([event])
	})

	it("flushes queued events, keeps the connection alive, and cleans up on close", () => {
		const client = makeSession()
		const event = { type: "error" as const, errorType: "ice", message: "queued" }
		client.pendingEvents.push(event)
		const response = new FakeResponse()

		attachSessionSse(client, response as unknown as ServerResponse)
		expect(response.writes).toEqual([
			": connected\n\n",
			"data: " + JSON.stringify(event) + "\n\n",
		])
		expect(client.pendingEvents).toEqual([])
		expect(client.sessionSseRes).toBe(response)

		vi.advanceTimersByTime(15_000)
		expect(response.writes.at(-1)).toBe(": keep-alive\n\n")

		response.emit("close")
		expect(client.sessionSseRes).toBeNull()
		expect(vi.getTimerCount()).toBe(0)
	})

	it("closes resources, stops the disconnect timer, and removes the session", () => {
		const client = makeSession()
		const response = new FakeResponse()
		client.sessionSseRes = response as unknown as ServerResponse
		const onTimeout = vi.fn()
		client.disconnectTimer = setTimeout(onTimeout, 1000)
		const clients = new Map([["session-1", client]])

		cleanupSession(clients, "session-1")
		cleanupSession(clients, "session-1")

		expect(client.pc.close).toHaveBeenCalledTimes(1)
		expect(client.inputHandler.destroy).toHaveBeenCalledTimes(1)
		expect(response.writableEnded).toBe(true)
		expect(clients.has("session-1")).toBe(false)
		vi.advanceTimersByTime(1000)
		expect(onTimeout).not.toHaveBeenCalled()
	})

	it("reports active input and SSE connections in session snapshots", () => {
		const client = makeSession()
		const response = new FakeResponse()
		client.sessionSseRes = response as unknown as ServerResponse

		expect(snapshotSessions(new Map([["session-1", client]]))).toEqual([
			{
				id: "session-1",
				state: "connected",
				createdAt: 1234,
				hasSseConnection: true,
				hasInputConnection: true,
				bytesRecv: 12,
				bytesSent: 34,
			},
		])

		response.writableEnded = true
		expect(snapshotSessions(new Map([["session-1", client]]))[0].hasSseConnection)
			.toBe(false)
	})
})
