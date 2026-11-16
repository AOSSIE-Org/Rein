import { isKnownToken } from "../tokenStore.ts"
import type { IncomingMessage, ServerResponse } from "node:http"
import { isLoopbackAddress } from "../../utils/net.ts"

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

export class PayloadTooLargeError extends Error {
	constructor() {
		super("Payload too large")
		this.name = "PayloadTooLargeError"
	}
}

export function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
	return new Promise((resolve, reject) => {
		const declared = Number(req.headers["content-length"])
		if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
			// Drain without destroying so the caller can still write 413.
			req.resume()
			reject(new PayloadTooLargeError())
			return
		}

		let body = ""
		let size = 0
		let settled = false

		const fail = (err: Error) => {
			if (settled) return
			settled = true
			body = ""
			reject(err)
		}

		req.on("data", (chunk) => {
			if (settled) return
			size += chunk.length
			if (size > MAX_BODY_BYTES) {
				// Drop the buffer and keep consuming so the socket stays writable.
				body = ""
				fail(new PayloadTooLargeError())
				return
			}
			body += chunk
		})
		req.on("end", () => {
			if (settled) return
			settled = true
			try {
				resolve(body ? JSON.parse(body) : ({} as T))
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)))
			}
		})
		req.on("error", (err: Error) => {
			fail(err)
		})
	})
}

export function json(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body)
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	})
	res.end(payload)
}

/** Writes 413 when `err` is a body-size failure. Returns false for every other error. */
export function respondIfPayloadTooLarge(
	res: ServerResponse,
	err: unknown,
): boolean {
	if (!(err instanceof PayloadTooLargeError)) return false
	json(res, 413, { error: "Payload too large" })
	return true
}

/** Returns true when the caller is authorized (local or valid bearer token). */
export function requireAuth(
	req: IncomingMessage,
	res: ServerResponse,
): boolean {
	const addr = req.socket.remoteAddress
	if (isLoopbackAddress(addr)) return true

	const authHeader = req.headers.authorization ?? ""
	let token = authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: null

	if (!token) {
		const url = new URL(req.url ?? "", `http://${req.headers.host}`)
		token = url.searchParams.get("token")
	}

	if (!token || !isKnownToken(token)) {
		json(res, 401, { error: "Unauthorized" })
		return false
	}
	return true
}
