import { EventEmitter } from "node:events"
import { Agent, createServer, request as httpRequest } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
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

async function createTestServer() {
	const server = createServer((req, res) => {
		if (req.url === "/health") {
			res.writeHead(200, {
				"Content-Type": "application/json",
			})
			res.end(JSON.stringify({ ok: true }))
			return
		}

		parseJsonBody(req)
			.then(() => {
				res.writeHead(200, {
					"Content-Type": "application/json",
				})
				res.end(JSON.stringify({ ok: true }))
			})
			.catch((err: unknown) => {
				if (respondIfPayloadTooLarge(res, err)) return

				res.writeHead(400, {
					"Content-Type": "application/json",
				})
				res.end(JSON.stringify({ error: "Invalid request body" }))
			})
	})

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(0, "127.0.0.1", () => {
			server.removeListener("error", reject)
			resolve()
		})
	})

	const address = server.address()

	if (!address || typeof address === "string") {
		throw new Error("Could not determine test server address")
	}

	const agent = new Agent({
		keepAlive: true,
		maxSockets: 1,
	})

	return {
		server,
		agent,
		port: address.port,

		async close() {
			agent.destroy()

			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err)
					else resolve()
				})
			})
		},
	}
}

interface HttpResult {
	statusCode: number | undefined
	body: string
	socket: Socket | null
}

function sendHttpRequest(
	port: number,
	agent: Agent,
	options: {
		method: string
		path: string
		headers?: Record<string, string>
		body?: Buffer | Buffer[]
	},
): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		let requestFinished = false
		let responseFinished = false
		let result: HttpResult | undefined

		const finishIfReady = () => {
			if (requestFinished && responseFinished && result) {
				resolve(result)
			}
		}

		const req = httpRequest(
			{
				hostname: "127.0.0.1",
				port,
				method: options.method,
				path: options.path,
				headers: options.headers,
				agent,
			},
			(res) => {
				let responseBody = ""
				const responseSocket = res.socket

				res.setEncoding("utf8")

				res.on("data", (chunk: string) => {
					responseBody += chunk
				})

				res.on("end", () => {
					responseFinished = true
					result = {
						statusCode: res.statusCode,
						body: responseBody,
						socket: responseSocket,
					}
					finishIfReady()
				})

				res.on("error", reject)
			},
		)

		req.on("finish", () => {
			requestFinished = true
			finishIfReady()
		})

		req.on("error", reject)

		const sendBody = async () => {
			if (Array.isArray(options.body)) {
				for (const chunk of options.body) {
					req.write(chunk)
					await new Promise<void>((resolve) => {
						setImmediate(resolve)
					})
				}
				req.end()
			} else {
				req.end(options.body)
			}
		}

		sendBody().catch(reject)
	})
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

describe("parseJsonBody HTTP integration", () => {
	it("returns 413 and reuses the connection for an oversized Content-Length", async () => {
		const testServer = await createTestServer()

		try {
			const body = Buffer.alloc(MAX_BODY_BYTES + 1, "x")

			const first = await sendHttpRequest(testServer.port, testServer.agent, {
				method: "POST",
				path: "/parse",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": String(body.length),
				},
				body,
			})

			expect(first.statusCode).toBe(413)
			expect(JSON.parse(first.body)).toEqual({
				error: "Payload too large",
			})

			const second = await sendHttpRequest(testServer.port, testServer.agent, {
				method: "GET",
				path: "/health",
			})

			expect(second.statusCode).toBe(200)
			expect(JSON.parse(second.body)).toEqual({ ok: true })
			expect(second.socket).toBe(first.socket)
		} finally {
			await testServer.close()
		}
	})

	it("returns 413 and reuses the connection for an oversized chunked body", async () => {
		const testServer = await createTestServer()

		try {
			const chunks = [
				Buffer.alloc(600 * 1024, "x"),
				Buffer.alloc(600 * 1024, "y"),
			]

			const first = await sendHttpRequest(testServer.port, testServer.agent, {
				method: "POST",
				path: "/parse",
				headers: {
					"Content-Type": "application/json",
				},
				body: chunks,
			})

			expect(first.statusCode).toBe(413)
			expect(JSON.parse(first.body)).toEqual({
				error: "Payload too large",
			})

			const second = await sendHttpRequest(testServer.port, testServer.agent, {
				method: "GET",
				path: "/health",
			})

			expect(second.statusCode).toBe(200)
			expect(JSON.parse(second.body)).toEqual({ ok: true })
			expect(second.socket).toBe(first.socket)
		} finally {
			await testServer.close()
		}
	})
})
