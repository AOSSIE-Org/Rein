import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { describe, expect, it, vi } from "vitest"
import type { WebRTCManager } from "../webRTC.ts"
import {
	handleAnswer,
	handleIce,
	handleOffer,
	handleSessionDelete,
	handleSessionSSE,
} from "./rtc.ts"

vi.mock("../../../utils/logger.ts", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

class FakeResponse extends EventEmitter {
	statusCode = 0
	body = ""

	writeHead(status: number): this {
		this.statusCode = status
		return this
	}

	end(body?: string): this {
		this.body = body ?? ""
		this.emit("finish")
		return this
	}
}

function makeRequest(url: string, body?: string): IncomingMessage {
	const request = Object.assign(new EventEmitter(), {
		url,
		headers: { host: "localhost", authorization: "Bearer access-token" },
		socket: { remoteAddress: "192.0.2.10" },
	})

	if (body !== undefined) {
		queueMicrotask(() => {
			request.emit("data", Buffer.from(body))
			request.emit("end")
		})
	}

	return request as unknown as IncomingMessage
}

function managerStub() {
	return {
		handleOffer: vi.fn(),
		handleAnswer: vi.fn(),
		handleIceCandidate: vi.fn(),
		handleDisconnect: vi.fn(),
		handleSessionSse: vi.fn(),
	}
}

function asManager(manager: ReturnType<typeof managerStub>): WebRTCManager {
	return manager as unknown as WebRTCManager
}

async function readResponse(response: FakeResponse) {
	await vi.waitFor(() => expect(response.body).not.toBe(""))
	return {
		status: response.statusCode,
		body: JSON.parse(response.body) as Record<string, unknown>,
	}
}

describe("RTC signaling HTTP handlers", () => {
	it("returns 503 when the WebRTC engine is unavailable", async () => {
		const response = new FakeResponse()

		handleOffer(makeRequest("/api/rtc/offer"), response as unknown as ServerResponse, {
			webrtcManager: null,
		})

		expect(await readResponse(response)).toEqual({
			status: 503,
			body: { error: "WebRTC engine not ready" },
		})
	})

	it("forwards offer credentials and returns a session description", async () => {
		const manager = managerStub()
		const offer = { type: "offer", sdp: "v=0" }
		manager.handleOffer.mockResolvedValue({ ok: true, sessionId: "s1", offer })
		const response = new FakeResponse()

		handleOffer(
			makeRequest("/api/rtc/offer?token=from-query"),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 200,
			body: { sessionId: "s1", offer },
		})
		expect(manager.handleOffer).toHaveBeenCalledWith(
			"192.0.2.10",
			"Bearer access-token",
			"from-query",
		)
	})

	it("returns 500 when an offer handler unexpectedly rejects", async () => {
		const manager = managerStub()
		manager.handleOffer.mockRejectedValue(new Error("unexpected"))
		const response = new FakeResponse()

		handleOffer(makeRequest("/api/rtc/offer"), response as unknown as ServerResponse, {
			webrtcManager: asManager(manager),
		})

		expect(await readResponse(response)).toEqual({
			status: 500,
			body: { error: "Internal server error" },
		})
	})

	it("rejects an SDP answer missing required fields before calling WebRTC", async () => {
		const manager = managerStub()
		const response = new FakeResponse()

		handleAnswer(
			makeRequest("/api/rtc/answer", JSON.stringify({ sessionId: "s1" })),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 400,
			body: { error: "Missing sessionId or sdp" },
		})
		expect(manager.handleAnswer).not.toHaveBeenCalled()
	})

	it("forwards a valid SDP answer and responds with success", async () => {
		const manager = managerStub()
		manager.handleAnswer.mockResolvedValue({ ok: true })
		const sdp = { type: "answer", sdp: "v=0" }
		const response = new FakeResponse()

		handleAnswer(
			makeRequest(
				"/api/rtc/answer?token=from-query",
				JSON.stringify({ sessionId: "s1", sdp }),
			),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 200,
			body: { ok: true },
		})
		expect(manager.handleAnswer).toHaveBeenCalledWith(
			"192.0.2.10",
			"Bearer access-token",
			"from-query",
			"s1",
			sdp,
		)
	})

	it("rejects malformed JSON instead of calling the answer handler", async () => {
		const manager = managerStub()
		const response = new FakeResponse()

		handleAnswer(
			makeRequest("/api/rtc/answer", "{not-valid-json"),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 400,
			body: { error: "Invalid request body" },
		})
		expect(manager.handleAnswer).not.toHaveBeenCalled()
	})

	it("forwards ICE candidates and propagates unsuccessful responses", async () => {
		const manager = managerStub()
		manager.handleIceCandidate.mockResolvedValue({
			ok: false,
			status: 401,
			error: "Unauthorized",
		})
		const candidate = { candidate: "candidate:123" }
		const response = new FakeResponse()

		handleIce(
			makeRequest("/api/rtc/ice", JSON.stringify({ sessionId: "s1", candidate })),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 401,
			body: { error: "Unauthorized" },
		})
		expect(manager.handleIceCandidate).toHaveBeenCalledWith(
			"192.0.2.10",
			"Bearer access-token",
			null,
			"s1",
			candidate,
		)
	})

	it("rejects session SSE connections without a session ID or authorization", async () => {
		const manager = managerStub()
		manager.handleSessionSse.mockReturnValue(false)
		const withoutId = new FakeResponse()

		handleSessionSSE(
			makeRequest("/api/rtc/session/events"),
			withoutId as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)
		expect(await readResponse(withoutId)).toEqual({
			status: 400,
			body: { error: "Missing sessionId" },
		})

		const rejected = new FakeResponse()
		handleSessionSSE(
			makeRequest("/api/rtc/session/events?sessionId=s1"),
			rejected as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)
		expect(await readResponse(rejected)).toEqual({
			status: 401,
			body: { error: "Unauthorized or session not found" },
		})
	})

	it("uses the request body session ID to disconnect a session", async () => {
		const manager = managerStub()
		manager.handleDisconnect.mockReturnValue({ ok: true })
		const response = new FakeResponse()

		handleSessionDelete(
			makeRequest("/api/rtc/session?token=from-query", JSON.stringify({ sessionId: "s1" })),
			response as unknown as ServerResponse,
			{ webrtcManager: asManager(manager) },
		)

		expect(await readResponse(response)).toEqual({
			status: 200,
			body: { ok: true },
		})
		expect(manager.handleDisconnect).toHaveBeenCalledWith(
			"192.0.2.10",
			"Bearer access-token",
			"from-query",
			"s1",
		)
	})
})
