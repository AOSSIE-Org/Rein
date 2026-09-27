import { isKnownToken } from "../tokenStore.ts"
import type { IncomingMessage, ServerResponse } from "node:http"
import { isLoopbackAddress } from "../../utils/net.ts"

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

export function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
	return new Promise((resolve, reject) => {
		let body = ""
		let size = 0
		req.on("data", (chunk) => {
			size += chunk.length
			if (size > MAX_BODY_BYTES) {
				req.destroy()
				reject(new Error("Payload too large"))
				return
			}
			body += chunk
		})
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : ({} as T))
			} catch (err) {
				reject(err)
			}
		})
		req.on("error", reject)
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
