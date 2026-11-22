import type { IncomingMessage } from "node:http"
import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { parseJsonBody, parseRequestUrl } from "./utils.ts"

function mockRequest(chunks: Buffer[]): IncomingMessage {
	const stream = new PassThrough()
	queueMicrotask(() => {
		for (const chunk of chunks) stream.write(chunk)
		stream.end()
	})
	return stream as unknown as IncomingMessage
}

describe("parseJsonBody", () => {
	it("decodes a multi-byte character split across chunks", async () => {
		const bytes = Buffer.from(JSON.stringify({ text: "héllo 世界 👋" }))
		const emoji = bytes.indexOf(Buffer.from("👋"))
		const req = mockRequest([
			bytes.subarray(0, emoji + 2),
			bytes.subarray(emoji + 2),
		])
		await expect(parseJsonBody(req)).resolves.toEqual({
			text: "héllo 世界 👋",
		})
	})

	it("returns an empty object for an empty body", async () => {
		await expect(parseJsonBody(mockRequest([]))).resolves.toEqual({})
	})

	it("rejects bodies over 1 MB", async () => {
		const req = mockRequest([Buffer.alloc(1024 * 1024 + 1, "a")])
		await expect(parseJsonBody(req)).rejects.toThrow("Payload too large")
	})
})

describe("parseRequestUrl", () => {
	it.each([
		["malformed Host header", "[", "/api/host/status"],
		["missing Host header", undefined, "/api/host/status"],
	])("parses requests with a %s", (_description, host, reqUrl) => {
		const req = {
			url: reqUrl,
			headers: host === undefined ? {} : { host },
		} as IncomingMessage

		expect(parseRequestUrl(req)?.pathname).toBe("/api/host/status")
	})

	it("returns null for a malformed request URL", () => {
		const req = {
			url: "http://[",
			headers: { host: "[" },
		} as IncomingMessage

		expect(parseRequestUrl(req)).toBeNull()
	})
})
