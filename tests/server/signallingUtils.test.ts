import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../src/server/tokenStore.ts", () => ({
	isKnownToken: (t: string) => t === "good-token",
}))

import {
	json,
	parseJsonBody,
	requireAuth,
} from "../../src/server/signalling/utils.ts"

function fakeReq(opts: {
	remote?: string
	url?: string
	headers?: Record<string, string>
}): IncomingMessage {
	return {
		socket: { remoteAddress: opts.remote ?? "192.168.1.20" },
		url: opts.url ?? "/",
		headers: opts.headers ?? {},
	} as unknown as IncomingMessage
}

function fakeRes() {
	const res = {
		status: 0,
		body: "",
		writeHead(status: number) {
			res.status = status
		},
		end(body: string) {
			res.body = body
		},
	}
	return res
}

describe("requireAuth", () => {
	let res: ReturnType<typeof fakeRes>
	beforeEach(() => {
		res = fakeRes()
	})
	const auth = (req: IncomingMessage) =>
		requireAuth(req, res as unknown as ServerResponse)

	it("allows loopback callers without a token", () => {
		expect(auth(fakeReq({ remote: "127.0.0.1" }))).toBe(true)
	})

	it("accepts a valid Bearer token", () => {
		const req = fakeReq({ headers: { authorization: "Bearer good-token" } })
		expect(auth(req)).toBe(true)
	})

	it("accepts a valid token from the query string", () => {
		const req = fakeReq({ url: "/x?token=good-token", headers: { host: "h" } })
		expect(auth(req)).toBe(true)
	})

	it("rejects missing and invalid tokens with 401", () => {
		expect(auth(fakeReq({}))).toBe(false)
		expect(res.status).toBe(401)
		expect(auth(fakeReq({ headers: { authorization: "Bearer nope" } }))).toBe(
			false,
		)
	})

	it("does not throw when the Host header is missing or malformed", () => {
		expect(() => auth(fakeReq({ url: "/x?token=bad" }))).not.toThrow()
		expect(res.status).toBe(401)
		const bad = fakeReq({
			url: "/x?token=good-token",
			headers: { host: "a b" },
		})
		expect(auth(bad)).toBe(true)
	})

	it("returns 401 when the request URL cannot be parsed", () => {
		// An unclosed IPv6 host makes URL parsing throw, exercising the catch.
		expect(() => auth(fakeReq({ url: "http://[" }))).not.toThrow()
		expect(res.status).toBe(401)
	})
})

describe("parseJsonBody", () => {
	function streamReq() {
		const req = new EventEmitter() as EventEmitter & { destroy: () => void }
		req.destroy = vi.fn()
		return req
	}

	it("parses a JSON body split across chunks", async () => {
		const req = streamReq()
		const p = parseJsonBody(req as unknown as IncomingMessage)
		req.emit("data", Buffer.from('{"a":'))
		req.emit("data", Buffer.from("1}"))
		req.emit("end")
		await expect(p).resolves.toEqual({ a: 1 })
	})

	it("resolves an empty body to an empty object", async () => {
		const req = streamReq()
		const p = parseJsonBody(req as unknown as IncomingMessage)
		req.emit("end")
		await expect(p).resolves.toEqual({})
	})

	it("rejects invalid JSON", async () => {
		const req = streamReq()
		const p = parseJsonBody(req as unknown as IncomingMessage)
		req.emit("data", Buffer.from("{oops"))
		req.emit("end")
		await expect(p).rejects.toThrow()
	})

	it("rejects bodies over 1 MB", async () => {
		const req = streamReq()
		const p = parseJsonBody(req as unknown as IncomingMessage)
		req.emit("data", Buffer.alloc(1024 * 1024 + 1))
		await expect(p).rejects.toThrow("Payload too large")
	})
})

describe("json", () => {
	it("writes status, length and body", () => {
		const headers: Record<string, unknown> = {}
		const res = {
			writeHead: (_s: number, h: Record<string, unknown>) =>
				Object.assign(headers, h),
			end: vi.fn(),
		}
		json(res as unknown as ServerResponse, 200, { ok: "é" })
		expect(headers["Content-Length"]).toBe(Buffer.byteLength('{"ok":"é"}'))
		expect(res.end).toHaveBeenCalledWith('{"ok":"é"}')
	})
})
