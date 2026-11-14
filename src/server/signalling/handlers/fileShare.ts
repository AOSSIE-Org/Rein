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
	filePath: string
	storageDir: string
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
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasControlChars(str: string): boolean {
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i)
		if (
			(code >= 0x00 && code <= 0x08) ||
			(code >= 0x0b && code <= 0x1f) ||
			code === 0x7f
		) {
			return true
		}
	}
	return false
}

function getMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase()
	const map: Record<string, string> = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".svg": "image/svg+xml",
		".webp": "image/webp",
		".mp4": "video/mp4",
		".webm": "video/webm",
		".mkv": "video/x-matroska",
		".avi": "video/x-msvideo",
		".mp3": "audio/mpeg",
		".wav": "audio/wav",
		".ogg": "audio/ogg",
		".flac": "audio/flac",
		".pdf": "application/pdf",
		".json": "application/json",
		".txt": "text/plain",
		".md": "text/markdown",
		".ts": "text/plain",
		".js": "text/plain",
		".tsx": "text/plain",
		".css": "text/css",
		".html": "text/html",
		".py": "text/plain",
		".c": "text/plain",
		".cpp": "text/plain",
		".zip": "application/zip",
		".tar": "application/x-tar",
		".gz": "application/gzip",
		".7z": "application/x-7z-compressed",
	}
	return map[ext] ?? "application/octet-stream"
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

function getOriginalFileName(filePath: string): string {
	const resolved = path.resolve(filePath)
	for (const file of fileStore.values()) {
		if (path.resolve(file.filePath) === resolved) {
			return file.name
		}
	}
	return path.basename(filePath)
}

export function isPathInside(childPath: string, parentDir: string): boolean {
	const rel = path.relative(parentDir, childPath)
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

function streamFile(
	res: ServerResponse,
	filePath: string,
	fileName: string,
	mimeType: string,
	stat: fs.Stats,
): void {
	if (res.destroyed || res.writableEnded) {
		return
	}

	const readStream = fs.createReadStream(filePath)
	let closed = false

	const onClose = () => {
		if (!res.writableEnded) {
			readStream.destroy()
		}
	}
	res.on("close", onClose)

	const cleanup = () => {
		if (closed) return
		closed = true
		res.off("close", onClose)
	}

	const onError = (err: unknown) => {
		cleanup()
		logger.error(`Download stream error for ${filePath}: ${err}`)
		if (!res.headersSent && !res.destroyed && !res.writableEnded) {
			json(res, 500, { error: "Failed to stream file" })
		} else {
			res.destroy()
		}
	}

	readStream.on("error", onError)
	readStream.once("end", cleanup)
	readStream.once("close", cleanup)

	readStream.once("open", () => {
		if (res.destroyed || res.writableEnded) {
			readStream.destroy()
			cleanup()
			return
		}

		const safeMimeType =
			mimeType && !hasControlChars(mimeType)
				? mimeType
				: "application/octet-stream"

		try {
			res.writeHead(200, {
				"Content-Type": safeMimeType,
				"Content-Length": stat.size,
				"Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
			})
		} catch (headerErr) {
			cleanup()
			logger.error(
				`Failed to write download headers for ${filePath}: ${String(headerErr)}`,
			)
			if (!res.headersSent && !res.destroyed && !res.writableEnded) {
				json(res, 500, { error: "Failed to stream file" })
			} else {
				res.destroy()
			}
			return
		}

		readStream.pipe(res)
	})
}

/** Parse a multipart/form-data body and return the first file field. */
function parseMultipart(
	req: IncomingMessage,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
	return new Promise((resolve, reject) => {
		const contentType = req.headers["content-type"] ?? ""
		const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
		if (!boundaryMatch) {
			reject(new Error("Missing multipart boundary"))
			return
		}
		const rawBoundary = boundaryMatch[1] ?? boundaryMatch[2]
		const boundary = `--${rawBoundary}`

		const chunks: Buffer[] = []
		let totalSize = 0
		let aborted = false

		req.on("data", (chunk: Buffer) => {
			if (aborted) return
			totalSize += chunk.length
			if (totalSize > MAX_FILE_BYTES) {
				aborted = true
				req.destroy()
				reject(new Error("File too large"))
				return
			}
			chunks.push(chunk)
		})

		req.on("end", () => {
			if (aborted) return
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
				const rawMimeType = ctMatch ? ctMatch[1].trim() : ""
				const mimeType =
					rawMimeType && !hasControlChars(rawMimeType)
						? rawMimeType
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

		req.on("error", (err) => {
			if (aborted) return
			aborted = true
			reject(err)
		})
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

		const uploadDir = path.resolve(getUploadDir())
		// Normalize Windows slashes and extract safe basename
		const normalizedName = name.replace(/\\/g, "/")
		const safeName = path.basename(normalizedName)
		if (!safeName || safeName === "." || safeName === "..") {
			json(res, 400, { ok: false, error: "Invalid file name" })
			return
		}

		const id = randomUUID()
		const fileDir = path.join(uploadDir, id)
		await fs.promises.mkdir(fileDir, { recursive: true })
		const filePath = path.join(fileDir, safeName)

		// Save uploaded file to host disk asynchronously
		await fs.promises.writeFile(filePath, data)

		const file: SharedFile = {
			id,
			name: safeName,
			mimeType,
			size: data.length,
			uploadedAt: Date.now(),
			uploadedBy,
			filePath,
			storageDir: uploadDir,
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

	try {
		const targetStat = await fs.promises.stat(targetPath)
		if (!targetStat.isDirectory()) {
			targetPath = path.dirname(targetPath)
		}
	} catch {
		targetPath = defaultDir
	}

	try {
		const entries = await fs.promises.readdir(targetPath, {
			withFileTypes: true,
		})
		const items: DirectoryItem[] = []

		// Index stored paths once per browse request for O(1) lookup
		const pathNameMap = new Map<string, string>()
		for (const file of fileStore.values()) {
			pathNameMap.set(path.resolve(file.filePath), file.name)
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue

			const fullPath = path.join(targetPath, entry.name)

			try {
				const isDir = entry.isDirectory()

				// If entry is a UUID upload directory, represent the uploaded file inside it
				if (isDir && UUID_REGEX.test(entry.name)) {
					try {
						const subEntries = await fs.promises.readdir(fullPath)
						if (subEntries.length === 1) {
							const subFileName = subEntries[0]
							const subFilePath = path.join(fullPath, subFileName)
							const subStat = await fs.promises.stat(subFilePath)
							const displayName =
								pathNameMap.get(path.resolve(subFilePath)) ?? subFileName

							items.push({
								name: displayName,
								path: subFilePath,
								isDir: false,
								size: subStat.size,
								mimeType: getMimeType(displayName),
								modifiedAt: subStat.mtimeMs,
							})
							continue
						}
					} catch {
						// Fall through to standard directory handling
					}
				}

				const entryStat = await fs.promises.stat(fullPath)
				const displayName =
					pathNameMap.get(path.resolve(fullPath)) ?? entry.name
				items.push({
					name: displayName,
					path: fullPath,
					isDir,
					size: isDir ? 0 : entryStat.size,
					mimeType: isDir ? "directory" : getMimeType(displayName),
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
export async function handleFileDownload(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (!requireAuth(req, res)) return
	const url = new URL(req.url ?? "", `http://${req.headers.host}`)
	const filePathParam = url.searchParams.get("path")
	const fileId = url.searchParams.get("fileId")

	if (filePathParam) {
		const targetPath = path.resolve(filePathParam)

		try {
			const stat = await fs.promises.stat(targetPath)
			if (res.destroyed || res.writableEnded) return

			if (!stat.isFile()) {
				json(res, 404, { error: "File not found" })
				return
			}

			const fileName = getOriginalFileName(targetPath)
			const mimeType = getMimeType(fileName)
			streamFile(res, targetPath, fileName, mimeType, stat)
			logger.info(`File downloaded from path: ${targetPath}`)
			return
		} catch (err: unknown) {
			if (res.destroyed || res.writableEnded) return
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				json(res, 404, { error: "File not found" })
				return
			}
			logger.error(`File stat error for ${targetPath}: ${String(err)}`)
			json(res, 500, { error: "Failed to read file" })
			return
		}
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

	try {
		const stat = await fs.promises.stat(file.filePath)
		if (res.destroyed || res.writableEnded) return

		if (!stat.isFile()) {
			json(res, 404, { error: "File not found" })
			return
		}

		streamFile(res, file.filePath, file.name, file.mimeType, stat)
		logger.info(`File downloaded: ${file.name} (${file.id})`)
	} catch (err: unknown) {
		if (res.destroyed || res.writableEnded) return
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			json(res, 404, { error: "File not found" })
			return
		}
		logger.error(`File stat error for ${file.filePath}: ${String(err)}`)
		json(res, 500, { error: "Failed to read file" })
		return
	}
}

/** DELETE /api/files?fileId=<id>  — remove a file */
export async function handleFileDelete(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
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

	// Clean up file on disk if it resides within the upload-time storage directory
	try {
		const storageDir = path.resolve(file.storageDir)
		const resolvedFilePath = path.resolve(file.filePath)
		if (isPathInside(resolvedFilePath, storageDir)) {
			try {
				await fs.promises.unlink(resolvedFilePath)
				const parentDir = path.dirname(resolvedFilePath)
				if (parentDir !== storageDir && isPathInside(parentDir, storageDir)) {
					try {
						await fs.promises.rmdir(parentDir)
					} catch {
						// Non-fatal if directory is not empty or cannot be removed
					}
				}
			} catch (unlinkErr: unknown) {
				// Treat already-missing file as successful cleanup
				if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") {
					logger.error(
						`Failed to remove file from disk (${file.filePath}): ${String(unlinkErr)}`,
					)
					json(res, 500, { error: "Failed to delete file from disk" })
					return
				}
			}
		}
	} catch (err) {
		logger.error(
			`Error resolving storage path for deletion (${file.filePath}): ${String(err)}`,
		)
		json(res, 500, { error: "Failed to delete file from disk" })
		return
	}

	// Only delete the record and broadcast after disk cleanup succeeds
	fileStore.delete(fileId)
	broadcastFileEvent({ type: "file-deleted", fileId })
	json(res, 200, { ok: true })
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _resetFileShareStateForTesting(): void {
	fileStore.clear()
	notifyClients.clear()
}

export function _getSharedFileForTesting(
	fileId: string,
): SharedFile | undefined {
	return fileStore.get(fileId)
}

export function _getFileStoreSizeForTesting(): number {
	return fileStore.size
}
