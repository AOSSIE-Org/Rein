import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { describe, expect, it, vi } from "vitest"
import {
	parseJsonBody,
	PayloadTooLargeError,
	respondIfPayloadTooLarge,
} from "@/server/signalling/utils"

const MAX_BODY_BYTES = 1024 * 1024

function createRequest(headers: Record<string, string> = {}) {
	const emitter = new EventEmitter()
	const req = {
		headers,
		destroy: vi.fn(),
		resume: vi.fn(),
		on: emitter.on.bind(emitter),
		emit: emitter.emit.bind(emitter),
	}
	return { req, emit: emitter.emit.bind(emitter) }
}

function asRequest(
	req: ReturnType<typeof createRequest>["req"],
): IncomingMessage {
	return req as unknown as IncomingMessage
}

describe("parseJsonBody", () => {
	it("resolves a JSON object", async () => {
		const { req, emit } = createRequest()
		const pending = parseJsonBody(asRequest(req))
		emit("data", Buffer.from('{"ok":true}'))
		emit("end")
		await expect(pending).resolves.toEqual({ ok: true })
		expect(req.destroy).not.toHaveBeenCalled()
	})

	it("resolves an empty body to an empty object", async () => {
		const { req, emit } = createRequest()
		const pending = parseJsonBody(asRequest(req))
		emit("end")
		await expect(pending).resolves.toEqual({})
	})

	it("rejects invalid JSON", async () => {
		const { req, emit } = createRequest()
		const pending = parseJsonBody(asRequest(req))
		emit("data", Buffer.from("{"))
		emit("end")
		await expect(pending).rejects.toBeInstanceOf(SyntaxError)
	})

	it("rejects an oversized body without destroying the request", async () => {
		const { req, emit } = createRequest()
		const pending = parseJsonBody(asRequest(req))
		emit("data", Buffer.alloc(MAX_BODY_BYTES + 1))
		emit("end")
		await expect(pending).rejects.toBeInstanceOf(PayloadTooLargeError)
		expect(req.destroy).not.toHaveBeenCalled()
	})

	it("rejects when Content-Length is already over the limit", async () => {
		const { req } = createRequest({
			"content-length": String(MAX_BODY_BYTES + 1),
		})
		await expect(parseJsonBody(asRequest(req))).rejects.toBeInstanceOf(
			PayloadTooLargeError,
		)
		expect(req.resume).toHaveBeenCalled()
		expect(req.destroy).not.toHaveBeenCalled()
	})
})

describe("respondIfPayloadTooLarge", () => {
	it("writes 413 for a payload size error", () => {
		const res = {
			writeHead: vi.fn(),
			end: vi.fn(),
		} as unknown as ServerResponse
		expect(respondIfPayloadTooLarge(res, new PayloadTooLargeError())).toBe(true)
		expect(res.writeHead).toHaveBeenCalledWith(
			413,
			expect.objectContaining({ "Content-Type": "application/json" }),
		)
		expect(res.end).toHaveBeenCalledWith(
			JSON.stringify({ error: "Payload too large" }),
		)
	})

	it("leaves other errors for the caller", () => {
		const res = {
			writeHead: vi.fn(),
			end: vi.fn(),
		} as unknown as ServerResponse
		expect(respondIfPayloadTooLarge(res, new Error("bad json"))).toBe(false)
		expect(res.writeHead).not.toHaveBeenCalled()
	})
})
