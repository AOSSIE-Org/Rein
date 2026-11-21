import { isKnownToken } from "../tokenStore.ts"
import type { IncomingMessage, ServerResponse } from "node:http"
import { isLoopbackAddress } from "../../utils/net.ts"

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

export function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
	return new Promise((resolve, reject) => {
		// Collect raw bytes and decode once: decoding chunk by chunk breaks
		// multi-byte UTF-8 characters that straddle a chunk boundary.
		const chunks: Buffer[] = []
		let size = 0
		req.on("data", (chunk: Buffer) => {
			size += chunk.length
			if (size > MAX_BODY_BYTES) {
				req.destroy()
				reject(new Error("Payload too large"))
				return
			}
			chunks.push(chunk)
		})
		req.on("end", () => {
			try {
				const body = Buffer.concat(chunks).toString("utf-8")
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
