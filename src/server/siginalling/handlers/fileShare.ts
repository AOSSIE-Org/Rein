import type { IncomingMessage, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { json, requireAuth } from "../utils.ts"
import logger from "../../../utils/logger.ts"

// ---------------------------------------------------------------------------
// In-memory file store (files held in RAM; suitable for local-network use)
// ---------------------------------------------------------------------------

export interface SharedFile {
	id: string
	name: string
	size: number
	mimeType: string
	uploadedAt: number
	uploadedBy: string
	data: Buffer
}

const fileStore = new Map<string, SharedFile>()
const notifyClients = new Set<ServerResponse>()

const MAX_FILE_BYTES = 512 * 1024 * 1024 // 512 MB hard ceiling

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function broadcastFileEvent(event: unknown): void {
	const payload = `data: ${JSON.stringify(event)}\n\n`
	for (const res of notifyClients) {
		try {
			res.write(payload)
		} catch {
			notifyClients.delete(res)
		}
	}
}

/** Parse a multipart/form-data body and return the first file field. */
function parseMultipart(
	req: IncomingMessage,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
	return new Promise((resolve, reject) => {
		const contentType = req.headers["content-type"] ?? ""
		const boundaryMatch = contentType.match(/boundary=(.+)$/)
		if (!boundaryMatch) {
			reject(new Error("Missing multipart boundary"))
			return
		}
		const boundary = `--${boundaryMatch[1]}`

		const chunks: Buffer[] = []
		let totalSize = 0

		req.on("data", (chunk: Buffer) => {
			totalSize += chunk.length
			if (totalSize > MAX_FILE_BYTES) {
				req.destroy()
				reject(new Error("File too large"))
				return
			}
			chunks.push(chunk)
		})

		req.on("end", () => {
			try {
				const body = Buffer.concat(chunks)
				const bodyStr = body.toString("binary")

				// Find the first part header block
				const firstBoundaryIdx = bodyStr.indexOf(boundary)
				if (firstBoundaryIdx === -1) throw new Error("Malformed multipart body")

				const headerStart = firstBoundaryIdx + boundary.length + 2 // skip \r\n
				const headerEnd = bodyStr.indexOf("\r\n\r\n", headerStart)
				if (headerEnd === -1) throw new Error("Malformed multipart headers")

				const headerBlock = bodyStr.slice(headerStart, headerEnd)

				// Extract filename from Content-Disposition
				const nameMatch = headerBlock.match(/filename="([^"]+)"/)
				const name = nameMatch ? nameMatch[1] : "file"

				// Extract Content-Type
				const ctMatch = headerBlock.match(/Content-Type:\s*([^\r\n]+)/i)
				const mimeType = ctMatch
					? ctMatch[1].trim()
					: "application/octet-stream"

				// Extract binary data (between header end and next boundary)
				const dataStart = headerEnd + 4 // skip \r\n\r\n
				const nextBoundary = bodyStr.indexOf(`\r\n${boundary}`, dataStart)
				const dataEnd = nextBoundary !== -1 ? nextBoundary : bodyStr.length

				const data = body.slice(dataStart, dataEnd)
				resolve({ name, mimeType, data })
			} catch (err) {
				reject(err)
			}
		})

		req.on("error", reject)
	})
}

// ---------------------------------------------------------------------------
// Public route handlers
// ---------------------------------------------------------------------------

/** POST /api/files/upload  — upload a file and broadcast notification */
export async function handleFileUpload(
	req: IncomingMessage,
	res: ServerResponse,
	uploadedBy: string,
): Promise<void> {
	if (!requireAuth(req, res)) return

	try {
		const { name, mimeType, data } = await parseMultipart(req)

		const id = randomUUID()
		const file: SharedFile = {
			id,
			name,
			mimeType,
			size: data.length,
			uploadedAt: Date.now(),
			uploadedBy,
			data,
		}
		fileStore.set(id, file)
		logger.info(
			`File uploaded: ${name} (${data.length} bytes) by ${uploadedBy}`,
		)

		// Notify all SSE subscribers
		broadcastFileEvent({
			type: "incoming-file",
			fileId: id,
			name,
			size: data.length,
			mimeType,
			uploadedAt: file.uploadedAt,
			uploadedBy,
		})

		json(res, 200, { ok: true, fileId: id })
	} catch (err) {
		logger.error(`File upload error: ${String(err)}`)
		json(res, 400, { ok: false, error: String(err) })
	}
}

/** GET /api/files/list  — list available files (no data) */
export function handleFileList(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return
	const list = [...fileStore.values()].map((f) => ({
		id: f.id,
		name: f.name,
		size: f.size,
		mimeType: f.mimeType,
		uploadedAt: f.uploadedAt,
		uploadedBy: f.uploadedBy,
	}))
	json(res, 200, { files: list })
}

/** GET /api/files/download?fileId=<id>  — stream file bytes */
export function handleFileDownload(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const fileId = url.searchParams.get("fileId")
	if (!fileId) {
		json(res, 400, { error: "Missing fileId" })
		return
	}
	const file = fileStore.get(fileId)
	if (!file) {
		json(res, 404, { error: "File not found" })
		return
	}
	res.writeHead(200, {
		"Content-Type": file.mimeType,
		"Content-Length": file.data.length,
		"Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
	})
	res.end(file.data)
	logger.info(`File downloaded: ${file.name} (${file.id})`)
}

/** DELETE /api/files?fileId=<id>  — remove a file */
export function handleFileDelete(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const fileId = url.searchParams.get("fileId")
	if (!fileId) {
		json(res, 400, { error: "Missing fileId" })
		return
	}
	const deleted = fileStore.delete(fileId)
	if (deleted) {
		broadcastFileEvent({ type: "file-deleted", fileId })
		json(res, 200, { ok: true })
	} else {
		json(res, 404, { error: "File not found" })
	}
}

/** GET /api/files/events  — SSE stream for file share notifications */
export function handleFileEvents(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	})
	res.write(": connected\n\n")

	// Send existing files so newly-connected clients are in sync
	const existing = [...fileStore.values()].map((f) => ({
		type: "incoming-file" as const,
		fileId: f.id,
		name: f.name,
		size: f.size,
		mimeType: f.mimeType,
		uploadedAt: f.uploadedAt,
		uploadedBy: f.uploadedBy,
	}))
	for (const ev of existing) {
		try {
			res.write(`data: ${JSON.stringify(ev)}\n\n`)
		} catch {
			break
		}
	}

	notifyClients.add(res)

	const keepAlive = setInterval(() => {
		try {
			res.write(": keep-alive\n\n")
		} catch {
			clearInterval(keepAlive)
			notifyClients.delete(res)
		}
	}, 15_000)

	const cleanup = () => {
		clearInterval(keepAlive)
		notifyClients.delete(res)
	}
	res.on("close", cleanup)
	res.on("error", cleanup)
}
