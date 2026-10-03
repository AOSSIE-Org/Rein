import type { IncomingMessage, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { json, requireAuth } from "../utils.ts"
import logger from "../../../utils/logger.ts"
import { getUploadDir } from "../../../utils/configHelper.ts"

// ---------------------------------------------------------------------------
// In-memory file store & directory browser types
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

export interface DirectoryItem {
	name: string
	path: string
	isDir: boolean
	size: number
	mimeType: string
	modifiedAt: number
}

const fileStore = new Map<string, SharedFile>()
const notifyClients = new Set<ServerResponse>()

const MAX_FILE_BYTES = 512 * 1024 * 1024 // 512 MB hard ceiling

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase()
	if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].includes(ext)) {
		return `image/${ext.slice(1)}`
	} else if ([".mp4", ".webm", ".mkv", ".avi"].includes(ext)) {
		return `video/${ext.slice(1)}`
	} else if ([".mp3", ".wav", ".ogg", ".flac"].includes(ext)) {
		return `audio/${ext.slice(1)}`
	}
	if (ext === ".pdf") {
		return "application/pdf"
	}
	if (ext === ".json") {
		return "application/json"
	} else if (
		[
			".txt",
			".md",
			".ts",
			".js",
			".tsx",
			".css",
			".html",
			".py",
			".c",
			".cpp",
		].includes(ext)
	) {
		return "text/plain"
	} else if ([".zip", ".tar", ".gz", ".7z"].includes(ext)) {
		return "application/zip"
	} else return "application/octet-stream"
}

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

/** POST /api/files/upload  — upload a file to host upload folder & broadcast notification */
export async function handleFileUpload(
	req: IncomingMessage,
	res: ServerResponse,
	uploadedBy: string,
): Promise<void> {
	if (!requireAuth(req, res)) return

	try {
		const { name, mimeType, data } = await parseMultipart(req)

		const uploadDir = getUploadDir()
		const safeName = path.basename(name)
		const filePath = path.join(uploadDir, safeName)

		// Save uploaded file to host disk
		fs.writeFileSync(filePath, data)

		const id = randomUUID()
		const file: SharedFile = {
			id,
			name: safeName,
			mimeType,
			size: data.length,
			uploadedAt: Date.now(),
			uploadedBy,
			data,
		}
		fileStore.set(id, file)
		logger.info(
			`File uploaded to ${filePath} (${data.length} bytes) by ${uploadedBy}`,
		)

		// Notify all SSE subscribers
		broadcastFileEvent({
			type: "incoming-file",
			fileId: id,
			name: safeName,
			size: data.length,
			mimeType,
			uploadedAt: file.uploadedAt,
			uploadedBy,
		})

		json(res, 200, { ok: true, fileId: id, path: filePath })
	} catch (err) {
		logger.error(`File upload error: ${String(err)}`)
		json(res, 400, { ok: false, error: String(err) })
	}
}

/** GET /api/files/browse?path=<dirPath>  — list host files and directories */
export async function handleFileBrowse(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return

	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const reqPath = url.searchParams.get("path")
	const defaultDir = getUploadDir()

	let targetPath = reqPath ? path.resolve(reqPath) : defaultDir

	if (!fs.existsSync(targetPath)) {
		targetPath = defaultDir
	}

	try {
		const stat = fs.statSync(targetPath)
		if (!stat.isDirectory()) {
			targetPath = path.dirname(targetPath)
		}

		const entries = await fs.promises.readdir(targetPath, {
			withFileTypes: true,
		})
		const items: DirectoryItem[] = []

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue

			const fullPath = path.join(targetPath, entry.name)
			try {
				const entryStat = fs.statSync(fullPath)
				const isDir = entry.isDirectory()
				items.push({
					name: entry.name,
					path: fullPath,
					isDir,
					size: isDir ? 0 : entryStat.size,
					mimeType: isDir ? "directory" : getMimeType(entry.name),
					modifiedAt: entryStat.mtimeMs,
				})
			} catch {
				// Skip unreadable files/symlinks
			}
		}

		items.sort((a, b) => {
			if (a.isDir && !b.isDir) return -1
			if (!a.isDir && b.isDir) return 1
			return a.name.localeCompare(b.name)
		})

		const parentPath = path.dirname(targetPath)

		json(res, 200, {
			currentPath: targetPath,
			parentPath: parentPath !== targetPath ? parentPath : null,
			items,
		})
	} catch (err) {
		logger.error(`File browse error: ${String(err)}`)
		json(res, 500, { error: `Failed to read directory: ${String(err)}` })
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

/** GET /api/files/download?path=<filePath> OR ?fileId=<id>  — stream file bytes */
export function handleFileDownload(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	if (!requireAuth(req, res)) return
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const filePathParam = url.searchParams.get("path")
	const fileId = url.searchParams.get("fileId")

	if (filePathParam) {
		const targetPath = path.resolve(filePathParam)
		if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
			json(res, 404, { error: "File not found" })
			return
		}
		const stat = fs.statSync(targetPath)
		const fileName = path.basename(targetPath)
		const mimeType = getMimeType(fileName)

		res.writeHead(200, {
			"Content-Type": mimeType,
			"Content-Length": stat.size,
			"Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
		})
		fs.createReadStream(targetPath).pipe(res)
		logger.info(`File downloaded from path: ${targetPath}`)
		return
	}

	if (!fileId) {
		json(res, 400, { error: "Missing path or fileId" })
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
