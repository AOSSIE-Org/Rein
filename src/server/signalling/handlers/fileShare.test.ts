import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import type { IncomingMessage, ServerResponse } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	handleFileUpload,
	handleFileList,
	handleFileDownload,
	handleFileDelete,
	handleFileBrowse,
	isPathInside,
	_resetFileShareStateForTesting,
	_getSharedFileForTesting,
	_getFileStoreSizeForTesting,
} from "./fileShare.ts"
import { getUploadDir } from "../../../utils/configHelper.ts"

vi.mock("../../../utils/configHelper.ts", () => ({
	getUploadDir: vi.fn(),
	loadServerConfig: vi.fn().mockReturnValue({}),
}))

interface MockRes extends PassThrough {
	statusCode: number
	headers: Record<string, string | number | string[]>
	bodyChunks: Buffer[]
	headersSent: boolean
	getBodyString: () => string
	getBodyJson: <T = unknown>() => T
	waitForEnd: () => Promise<void>
}

function createMockReq(options: {
	url?: string
	method?: string
	headers?: Record<string, string>
	body?: Buffer | string
	remoteAddress?: string
}): IncomingMessage {
	const stream = new PassThrough()
	const req = stream as unknown as IncomingMessage
	req.url = options.url ?? "/api/files"
	req.method = options.method ?? "GET"
	req.headers = options.headers ?? {}
	// Remote address is set to loopback to satisfy requireAuth
	req.socket = {
		remoteAddress: options.remoteAddress ?? "127.0.0.1",
	} as unknown as IncomingMessage["socket"]

	if (options.body) {
		stream.end(options.body)
	}
	return req
}

function createMockRes(): MockRes & ServerResponse {
	const res = new PassThrough() as unknown as MockRes & ServerResponse
	res.statusCode = 200
	res.headers = {}
	res.bodyChunks = []
	res.headersSent = false

	// Consume readable side of PassThrough so stream buffer does not stall under backpressure
	res.on("data", () => {})

	;(res as unknown as Record<string, unknown>).writeHead = (
		status: number,
		arg2?: unknown,
		arg3?: unknown,
	) => {
		res.statusCode = status
		const headers = typeof arg2 === "object" && arg2 !== null ? arg2 : arg3
		if (headers && typeof headers === "object") {
			Object.assign(res.headers, headers)
		}
		res.headersSent = true
		return res
	}

	const originalWrite = res.write.bind(res)
	res.write = ((chunk: unknown, ...args: unknown[]) => {
		if (chunk) {
			res.bodyChunks.push(
				Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
			)
		}
		// @ts-expect-error PassThrough write argument spread
		return originalWrite(chunk, ...args)
	}) as unknown as typeof res.write

	const originalEnd = res.end.bind(res)
	res.end = ((chunk?: unknown, ...args: unknown[]) => {
		if (chunk) {
			res.bodyChunks.push(
				Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
			)
		}
		// @ts-expect-error PassThrough end argument spread
		return originalEnd(chunk, ...args)
	}) as unknown as typeof res.end

	res.getBodyString = () => Buffer.concat(res.bodyChunks).toString("utf-8")
	res.getBodyJson = <T = unknown>() => JSON.parse(res.getBodyString()) as T

	res.waitForEnd = () =>
		new Promise<void>((resolve) => {
			if (res.writableEnded || res.destroyed) {
				resolve()
			} else {
				res.on("finish", resolve)
				res.on("end", resolve)
				res.on("close", resolve)
			}
		})

	return res
}

function createMultipartPayload(
	filename: string,
	mimeType: string,
	content: Buffer | string,
	boundary = "----WebKitFormBoundaryTest123",
): { contentType: string; body: Buffer } {
	const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
	const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
	const footer = `\r\n--${boundary}--\r\n`
	const body = Buffer.concat([
		Buffer.from(header, "utf-8"),
		data,
		Buffer.from(footer, "utf-8"),
	])
	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		body,
	}
}

describe("fileShare handler", () => {
	let testUploadDir: string

	beforeEach(() => {
		vi.clearAllMocks()
		_resetFileShareStateForTesting()
		testUploadDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "rein-fileshare-test-"),
		)
		vi.mocked(getUploadDir).mockReturnValue(testUploadDir)
	})

	afterEach(() => {
		_resetFileShareStateForTesting()
		if (fs.existsSync(testUploadDir)) {
			fs.rmSync(testUploadDir, { recursive: true, force: true })
		}
	})

	describe("handleFileUpload", () => {
		it("uploads file to disk and does not retain binary Buffer in memory", async () => {
			const fileContent = "Hello Rein Streaming World"
			const { contentType, body } = createMultipartPayload(
				"test-doc.txt",
				"text/plain",
				fileContent,
			)

			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const res = createMockRes()

			await handleFileUpload(req, res, "testUser")
			await res.waitForEnd()

			expect(res.statusCode).toBe(200)
			const resJson = res.getBodyJson<{
				ok: boolean
				fileId: string
				path: string
			}>()
			expect(resJson.ok).toBe(true)
			expect(resJson.fileId).toBeDefined()

			// Check file exists on disk with correct content
			expect(fs.existsSync(resJson.path)).toBe(true)
			expect(fs.readFileSync(resJson.path, "utf-8")).toBe(fileContent)

			// Memory safety: verify SharedFile stores filePath and NO buffer data
			const storedFile = _getSharedFileForTesting(resJson.fileId)
			expect(storedFile).toBeDefined()
			expect(storedFile?.name).toBe("test-doc.txt")
			expect(storedFile?.filePath).toBe(resJson.path)
			expect(storedFile?.storageDir).toBe(testUploadDir)
			expect(storedFile?.size).toBe(Buffer.byteLength(fileContent))
			// @ts-expect-error verifying data property was removed
			expect(storedFile?.data).toBeUndefined()
		})

		it("assigns distinct backing paths to uploads with identical basenames", async () => {
			const payload1 = createMultipartPayload(
				"sample.txt",
				"text/plain",
				"First Upload Content",
			)
			const req1 = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": payload1.contentType },
				body: payload1.body,
			})
			const res1 = createMockRes()
			await handleFileUpload(req1, res1, "user1")
			await res1.waitForEnd()
			const json1 = res1.getBodyJson<{
				ok: boolean
				fileId: string
				path: string
			}>()

			const payload2 = createMultipartPayload(
				"sample.txt",
				"text/plain",
				"Second Upload Content",
			)
			const req2 = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": payload2.contentType },
				body: payload2.body,
			})
			const res2 = createMockRes()
			await handleFileUpload(req2, res2, "user2")
			await res2.waitForEnd()
			const json2 = res2.getBodyJson<{
				ok: boolean
				fileId: string
				path: string
			}>()

			expect(json1.fileId).not.toBe(json2.fileId)
			expect(json1.path).not.toBe(json2.path)
			expect(fs.readFileSync(json1.path, "utf-8")).toBe("First Upload Content")
			expect(fs.readFileSync(json2.path, "utf-8")).toBe("Second Upload Content")

			// Download first file
			const dlReq1 = createMockReq({
				url: `/api/files/download?fileId=${json1.fileId}`,
			})
			const dlRes1 = createMockRes()
			await handleFileDownload(dlReq1, dlRes1)
			await dlRes1.waitForEnd()
			expect(dlRes1.getBodyString()).toBe("First Upload Content")

			// Download second file
			const dlReq2 = createMockReq({
				url: `/api/files/download?fileId=${json2.fileId}`,
			})
			const dlRes2 = createMockRes()
			await handleFileDownload(dlReq2, dlRes2)
			await dlRes2.waitForEnd()
			expect(dlRes2.getBodyString()).toBe("Second Upload Content")

			// Delete first file
			const delReq = createMockReq({
				url: `/api/files?fileId=${json1.fileId}`,
				method: "DELETE",
			})
			const delRes = createMockRes()
			await handleFileDelete(delReq, delRes)
			await delRes.waitForEnd()

			// Verify first backing file is removed, but second backing file still exists
			expect(fs.existsSync(json1.path)).toBe(false)
			expect(fs.existsSync(json2.path)).toBe(true)

			// Second file still downloads correctly
			const dlReq2After = createMockReq({
				url: `/api/files/download?fileId=${json2.fileId}`,
			})
			const dlRes2After = createMockRes()
			await handleFileDownload(dlReq2After, dlRes2After)
			await dlRes2After.waitForEnd()
			expect(dlRes2After.getBodyString()).toBe("Second Upload Content")
		})

		it("handles multipart body with quoted boundary", async () => {
			const rawBoundary = "----WebKitFormBoundaryQuoted123"
			const fileContent = "Quoted boundary test payload"
			const payload = createMultipartPayload(
				"quoted.txt",
				"text/plain",
				fileContent,
				rawBoundary,
			)
			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: {
					"content-type": `multipart/form-data; boundary="${rawBoundary}"`,
				},
				body: payload.body,
			})
			const res = createMockRes()
			await handleFileUpload(req, res, "user")
			await res.waitForEnd()

			expect(res.statusCode).toBe(200)
			const resJson = res.getBodyJson<{ ok: boolean; path: string }>()
			expect(fs.readFileSync(resJson.path, "utf-8")).toBe(fileContent)
		})

		it("handles multipart body with boundary followed by parameters", async () => {
			const rawBoundary = "----WebKitFormBoundaryParam456"
			const fileContent = "Param boundary test payload"
			const payload = createMultipartPayload(
				"param.txt",
				"text/plain",
				fileContent,
				rawBoundary,
			)
			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: {
					"content-type": `multipart/form-data; boundary=${rawBoundary}; charset=utf-8`,
				},
				body: payload.body,
			})
			const res = createMockRes()
			await handleFileUpload(req, res, "user")
			await res.waitForEnd()

			expect(res.statusCode).toBe(200)
			const resJson = res.getBodyJson<{ ok: boolean; path: string }>()
			expect(fs.readFileSync(resJson.path, "utf-8")).toBe(fileContent)
		})

		it("rejects path traversal in filename and sanitizes to basename", async () => {
			const { contentType, body } = createMultipartPayload(
				"../../malicious.txt",
				"text/plain",
				"traversal attempt",
			)

			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const res = createMockRes()

			await handleFileUpload(req, res, "testUser")
			await res.waitForEnd()

			expect(res.statusCode).toBe(200)
			const resJson = res.getBodyJson<{
				ok: boolean
				path: string
				fileId: string
			}>()
			expect(resJson.ok).toBe(true)
			expect(path.basename(resJson.path)).toBe("malicious.txt")
			expect(path.basename(path.dirname(resJson.path))).toBe(resJson.fileId)
			expect(_getSharedFileForTesting(resJson.fileId)?.name).toBe(
				"malicious.txt",
			)
		})

		it("accepts and saves valid long filenames without exceeding filesystem filename limits", async () => {
			const longBaseName = `${"a".repeat(226)}.txt` // 230 characters
			const content = "Long filename content"
			const { contentType, body } = createMultipartPayload(
				longBaseName,
				"text/plain",
				content,
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			expect(uploadRes.statusCode).toBe(200)
			const resJson = uploadRes.getBodyJson<{ fileId: string; path: string }>()
			expect(resJson.fileId).toBeDefined()
			expect(path.basename(resJson.path)).toBe(longBaseName)
			expect(path.basename(path.dirname(resJson.path))).toBe(resJson.fileId)

			const storedFile = _getSharedFileForTesting(resJson.fileId)
			expect(storedFile).toBeDefined()
			expect(storedFile?.name).toBe(longBaseName)
		})

		it("sanitizes Content-Type containing control characters to application/octet-stream fallback", async () => {
			const { contentType, body } = createMultipartPayload(
				"safe.txt",
				"text/plain\u0001\u0002",
				"test content",
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			expect(uploadRes.statusCode).toBe(200)
			const { fileId } = uploadRes.getBodyJson<{ fileId: string }>()
			const file = _getSharedFileForTesting(fileId)
			expect(file).toBeDefined()
			expect(file?.mimeType).toBe("application/octet-stream")

			// Download should succeed with safe fallback type and not crash with ERR_INVALID_CHAR
			const downloadReq = createMockReq({
				url: `/api/files/download?fileId=${fileId}`,
				method: "GET",
			})
			const downloadRes = createMockRes()
			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.headers["Content-Type"]).toBe(
				"application/octet-stream",
			)
		})

		it("rejects invalid filename like dot-dot", async () => {
			const { contentType, body } = createMultipartPayload(
				"..",
				"text/plain",
				"invalid",
			)

			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const res = createMockRes()

			await handleFileUpload(req, res, "testUser")
			await res.waitForEnd()

			expect(res.statusCode).toBe(400)
			const resJson = res.getBodyJson<{ ok: boolean; error: string }>()
			expect(resJson.ok).toBe(false)
			expect(resJson.error).toBe("Invalid file name")
		})

		it("rejects request missing multipart boundary", async () => {
			const req = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": "multipart/form-data" },
				body: Buffer.from("raw data"),
			})
			const res = createMockRes()

			await handleFileUpload(req, res, "testUser")
			await res.waitForEnd()

			expect(res.statusCode).toBe(400)
			const resJson = res.getBodyJson<{ ok: boolean; error: string }>()
			expect(resJson.ok).toBe(false)
			expect(resJson.error).toContain("Missing multipart boundary")
		})
	})

	describe("handleFileList", () => {
		it("lists all uploaded shared files without exposing buffer", async () => {
			const { contentType, body } = createMultipartPayload(
				"notes.txt",
				"text/plain",
				"file list test",
			)
			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			const listReq = createMockReq({ url: "/api/files/list", method: "GET" })
			const listRes = createMockRes()

			handleFileList(listReq, listRes)
			await listRes.waitForEnd()

			expect(listRes.statusCode).toBe(200)
			const data = listRes.getBodyJson<{
				files: Array<{ id: string; name: string; size: number }>
			}>()
			expect(data.files.length).toBe(1)
			expect(data.files[0].name).toBe("notes.txt")
			expect(data.files[0].size).toBe(Buffer.byteLength("file list test"))
			// @ts-expect-error verify data is omitted from list response
			expect(data.files[0].data).toBeUndefined()
		})
	})

	describe("handleFileDownload", () => {
		it("streams file content when requested via fileId", async () => {
			const content = "Streaming binary download test content"
			const { contentType, body } = createMultipartPayload(
				"sample.txt",
				"text/plain",
				content,
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()
			const { fileId } = uploadRes.getBodyJson<{ fileId: string }>()

			const downloadReq = createMockReq({
				url: `/api/files/download?fileId=${fileId}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.headers["Content-Type"]).toBe("text/plain")
			expect(downloadRes.headers["Content-Length"]).toBe(
				Buffer.byteLength(content),
			)
			expect(downloadRes.getBodyString()).toBe(content)
		})

		it("streams file content when requested via path", async () => {
			const targetFile = path.join(testUploadDir, "direct-path.txt")
			fs.writeFileSync(targetFile, "Direct path stream content")

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.getBodyString()).toBe("Direct path stream content")
		})

		it("destroys the read stream if client cancels download early", async () => {
			const largeContent = "X".repeat(1024 * 64)
			const targetFile = path.join(testUploadDir, "cancellation-test.txt")
			await fs.promises.writeFile(targetFile, largeContent)

			let createdReadStream: fs.ReadStream | null = null
			const originalCreateReadStream = fs.createReadStream.bind(fs)
			const spy = vi.spyOn(fs, "createReadStream").mockImplementation(((
				...args: Parameters<typeof fs.createReadStream>
			) => {
				const stream = originalCreateReadStream(...args)
				createdReadStream = stream
				return stream
			}) as unknown as typeof fs.createReadStream)

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)

			// Simulate client disconnecting early before response ends
			downloadRes.emit("close")

			expect(createdReadStream).not.toBeNull()
			expect((createdReadStream as fs.ReadStream | null)?.destroyed).toBe(true)

			spy.mockRestore()
		})

		it("returns early and does not create stream if response destroyed while stat is pending", async () => {
			const targetFile = path.join(testUploadDir, "destroyed-after-stat.txt")
			await fs.promises.writeFile(targetFile, "content")

			const originalStat = fs.promises.stat.bind(fs.promises)
			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			let createStreamCalled = false
			const originalCreateReadStream = fs.createReadStream.bind(fs)
			const streamSpy = vi.spyOn(fs, "createReadStream").mockImplementation(((
				...args: Parameters<typeof fs.createReadStream>
			) => {
				createStreamCalled = true
				return originalCreateReadStream(...args)
			}) as unknown as typeof fs.createReadStream)

			const statSpy = vi
				.spyOn(fs.promises, "stat")
				.mockImplementation(
					async (...args: Parameters<typeof fs.promises.stat>) => {
						const result = await originalStat(...args)
						downloadRes.destroyed = true
						return result
					},
				)

			await handleFileDownload(downloadReq, downloadRes)

			expect(createStreamCalled).toBe(false)
			statSpy.mockRestore()
			streamSpy.mockRestore()
		})

		it("sends 500 without sending 200 headers if read stream fails before open", async () => {
			const targetFile = path.join(
				testUploadDir,
				"stream-error-before-open.txt",
			)
			await fs.promises.writeFile(targetFile, "error content")

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			const streamSpy = vi
				.spyOn(fs, "createReadStream")
				.mockImplementation((() => {
					const fakeStream = new PassThrough()
					process.nextTick(() => {
						fakeStream.emit("error", new Error("Simulated disk read error"))
					})
					return fakeStream
				}) as unknown as typeof fs.createReadStream)

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(500)
			expect(downloadRes.getBodyJson<{ error: string }>().error).toBe(
				"Failed to stream file",
			)
			streamSpy.mockRestore()
		})

		it("destroys response without sending a second response if read stream fails after open", async () => {
			const targetFile = path.join(testUploadDir, "stream-error-after-open.txt")
			await fs.promises.writeFile(targetFile, "error after open content")

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			const fakeStream = new PassThrough()
			const streamSpy = vi
				.spyOn(fs, "createReadStream")
				.mockImplementation((() => {
					process.nextTick(() => {
						fakeStream.emit("open")
						process.nextTick(() => {
							fakeStream.emit("error", new Error("Mid-stream read failure"))
						})
					})
					return fakeStream
				}) as unknown as typeof fs.createReadStream)

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.headersSent).toBe(true)
			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.destroyed).toBe(true)
			expect(downloadRes.bodyChunks.length).toBe(0)

			streamSpy.mockRestore()
		})

		it("uses original filename in Content-Disposition for path-based download of uploaded file", async () => {
			const originalName = "presentation-slides.pdf"
			const fileContent = "PDF file content"
			const { contentType, body } = createMultipartPayload(
				originalName,
				"application/pdf",
				fileContent,
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			const { fileId } = uploadRes.getBodyJson<{ fileId: string }>()
			const sharedFile = _getSharedFileForTesting(fileId)
			expect(sharedFile).toBeDefined()
			expect(sharedFile?.filePath).toContain(fileId)
			expect(path.basename(sharedFile?.filePath ?? "")).toBe(originalName)

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(sharedFile?.filePath ?? "")}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			const disposition = downloadRes.headers["Content-Disposition"] as string
			expect(disposition).toContain(`filename="${originalName}"`)
			expect(disposition).not.toContain(fileId)
		})

		it("successfully streams large downloads exceeding stream buffer without stalling under backpressure", async () => {
			// 256 KB payload exceeds both PassThrough (16 KB) and fs stream (64 KB) buffer limits
			const largeContent = Buffer.alloc(256 * 1024, "L")
			const targetFile = path.join(testUploadDir, "large-download-test.bin")
			await fs.promises.writeFile(targetFile, largeContent)

			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(targetFile)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.headers["Content-Length"]).toBe(largeContent.length)
			expect(Buffer.concat(downloadRes.bodyChunks)).toEqual(largeContent)
		})

		it("returns 404 if fileId is unknown", async () => {
			const downloadReq = createMockReq({
				url: "/api/files/download?fileId=non-existent-id",
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(404)
			const resJson = downloadRes.getBodyJson<{ error: string }>()
			expect(resJson.error).toBe("File not found")
		})

		it("returns 404 if file was removed from disk", async () => {
			const { contentType, body } = createMultipartPayload(
				"ghost.txt",
				"text/plain",
				"ghost content",
			)
			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()
			const { fileId, path: savedPath } = uploadRes.getBodyJson<{
				fileId: string
				path: string
			}>()

			// Delete from disk
			fs.unlinkSync(savedPath)

			const downloadReq = createMockReq({
				url: `/api/files/download?fileId=${fileId}`,
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(404)
			expect(downloadRes.getBodyJson<{ error: string }>().error).toBe(
				"File not found",
			)
		})

		it("returns 400 when missing both path and fileId parameters", async () => {
			const downloadReq = createMockReq({
				url: "/api/files/download",
				method: "GET",
			})
			const downloadRes = createMockRes()

			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(400)
			expect(downloadRes.getBodyJson<{ error: string }>().error).toBe(
				"Missing path or fileId",
			)
		})
	})

	describe("handleFileDelete", () => {
		it("removes file from memory store and unlinks file from disk", async () => {
			const { contentType, body } = createMultipartPayload(
				"to-delete.txt",
				"text/plain",
				"delete me",
			)
			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()
			const { fileId, path: savedPath } = uploadRes.getBodyJson<{
				fileId: string
				path: string
			}>()

			expect(fs.existsSync(savedPath)).toBe(true)
			expect(_getFileStoreSizeForTesting()).toBe(1)

			const deleteReq = createMockReq({
				url: `/api/files?fileId=${fileId}`,
				method: "DELETE",
			})
			const deleteRes = createMockRes()

			await handleFileDelete(deleteReq, deleteRes)
			await deleteRes.waitForEnd()

			expect(deleteRes.statusCode).toBe(200)
			expect(deleteRes.getBodyJson<{ ok: boolean }>().ok).toBe(true)
			expect(_getFileStoreSizeForTesting()).toBe(0)
			expect(fs.existsSync(savedPath)).toBe(false)
		})

		it("cleans up disk file using upload-time storage directory even if uploadDir changes later", async () => {
			const payload = createMultipartPayload(
				"persist-dir.txt",
				"text/plain",
				"content",
			)
			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": payload.contentType },
				body: payload.body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "user")
			await uploadRes.waitForEnd()
			const { fileId, path: savedPath } = uploadRes.getBodyJson<{
				fileId: string
				path: string
			}>()

			expect(fs.existsSync(savedPath)).toBe(true)

			// Simulate upload directory being reconfigured to a new directory
			const newDir = fs.mkdtempSync(path.join(os.tmpdir(), "rein-new-upload-"))
			vi.mocked(getUploadDir).mockReturnValue(newDir)

			const deleteReq = createMockReq({
				url: `/api/files?fileId=${fileId}`,
				method: "DELETE",
			})
			const deleteRes = createMockRes()
			await handleFileDelete(deleteReq, deleteRes)
			await deleteRes.waitForEnd()

			expect(deleteRes.statusCode).toBe(200)
			expect(fs.existsSync(savedPath)).toBe(false)

			fs.rmSync(newDir, { recursive: true, force: true })
		})

		it("retains record and returns 500 when disk deletion fails", async () => {
			const payload = createMultipartPayload(
				"locked.txt",
				"text/plain",
				"locked file",
			)
			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": payload.contentType },
				body: payload.body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "user")
			await uploadRes.waitForEnd()
			const { fileId } = uploadRes.getBodyJson<{ fileId: string }>()

			// Mock unlink to simulate filesystem error (e.g. EPERM / EACCES)
			const unlinkSpy = vi
				.spyOn(fs.promises, "unlink")
				.mockRejectedValue(new Error("EPERM: operation not permitted"))

			const deleteReq = createMockReq({
				url: `/api/files?fileId=${fileId}`,
				method: "DELETE",
			})
			const deleteRes = createMockRes()
			await handleFileDelete(deleteReq, deleteRes)
			await deleteRes.waitForEnd()

			expect(deleteRes.statusCode).toBe(500)
			// Record must still be retained
			expect(_getSharedFileForTesting(fileId)).toBeDefined()

			unlinkSpy.mockRestore()
		})

		it("returns 404 when attempting to delete non-existent file", async () => {
			const deleteReq = createMockReq({
				url: "/api/files?fileId=unknown-id",
				method: "DELETE",
			})
			const deleteRes = createMockRes()

			await handleFileDelete(deleteReq, deleteRes)
			await deleteRes.waitForEnd()

			expect(deleteRes.statusCode).toBe(404)
			expect(deleteRes.getBodyJson<{ error: string }>().error).toBe(
				"File not found",
			)
		})

		it("returns 400 when fileId parameter is omitted", async () => {
			const deleteReq = createMockReq({
				url: "/api/files",
				method: "DELETE",
			})
			const deleteRes = createMockRes()

			await handleFileDelete(deleteReq, deleteRes)
			await deleteRes.waitForEnd()

			expect(deleteRes.statusCode).toBe(400)
			expect(deleteRes.getBodyJson<{ error: string }>().error).toBe(
				"Missing fileId",
			)
		})
	})

	describe("handleFileBrowse", () => {
		it("lists items inside target directory with type and stats", async () => {
			fs.writeFileSync(path.join(testUploadDir, "item1.txt"), "hello")
			fs.mkdirSync(path.join(testUploadDir, "subdir"))

			const browseReq = createMockReq({
				url: `/api/files/browse?path=${encodeURIComponent(testUploadDir)}`,
				method: "GET",
			})
			const browseRes = createMockRes()

			await handleFileBrowse(browseReq, browseRes)
			await browseRes.waitForEnd()

			expect(browseRes.statusCode).toBe(200)
			const resJson = browseRes.getBodyJson<{
				currentPath: string
				items: Array<{ name: string; isDir: boolean; mimeType: string }>
			}>()

			expect(resJson.currentPath).toBe(path.resolve(testUploadDir))
			const names = resJson.items.map((i) => i.name)
			expect(names).toContain("item1.txt")
			expect(names).toContain("subdir")

			const subDirItem = resJson.items.find((i) => i.name === "subdir")
			expect(subDirItem?.isDir).toBe(true)
			expect(subDirItem?.mimeType).toBe("directory")
		})

		it("returns original filename instead of UUID-prefixed disk name for uploaded files in browse", async () => {
			const originalName = "important-document.docx"
			const { contentType, body } = createMultipartPayload(
				originalName,
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"docx content",
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			const { fileId } = uploadRes.getBodyJson<{ fileId: string }>()

			const browseReq = createMockReq({
				url: `/api/files/browse?path=${encodeURIComponent(testUploadDir)}`,
				method: "GET",
			})
			const browseRes = createMockRes()

			await handleFileBrowse(browseReq, browseRes)
			await browseRes.waitForEnd()

			expect(browseRes.statusCode).toBe(200)
			const resJson = browseRes.getBodyJson<{
				items: Array<{ name: string; isDir: boolean }>
			}>()
			const fileNames = resJson.items.map((i) => i.name)

			expect(fileNames).toContain(originalName)
			expect(fileNames.some((name) => name === fileId)).toBe(false)
		})

		it("recovers original filename and content type in browse and path download across server restarts", async () => {
			const originalName = "reboot-document.pdf"
			const content = "Reboot persistence content"
			const { contentType, body } = createMultipartPayload(
				originalName,
				"application/pdf",
				content,
			)

			const uploadReq = createMockReq({
				url: "/api/files/upload",
				method: "POST",
				headers: { "content-type": contentType },
				body,
			})
			const uploadRes = createMockRes()
			await handleFileUpload(uploadReq, uploadRes, "host")
			await uploadRes.waitForEnd()

			const { fileId, path: savedPath } = uploadRes.getBodyJson<{
				fileId: string
				path: string
			}>()

			// Simulate server restart by clearing in-memory fileStore
			_resetFileShareStateForTesting()
			expect(_getSharedFileForTesting(fileId)).toBeUndefined()

			// 1. Browse upload directory: must discover the file under its original name and MIME type
			const browseReq = createMockReq({
				url: `/api/files/browse?path=${encodeURIComponent(testUploadDir)}`,
				method: "GET",
			})
			const browseRes = createMockRes()
			await handleFileBrowse(browseReq, browseRes)
			await browseRes.waitForEnd()

			expect(browseRes.statusCode).toBe(200)
			const browseJson = browseRes.getBodyJson<{
				items: Array<{
					name: string
					path: string
					isDir: boolean
					mimeType: string
				}>
			}>()
			const item = browseJson.items.find((i) => i.name === originalName)
			expect(item).toBeDefined()
			expect(item?.isDir).toBe(false)
			expect(item?.mimeType).toBe("application/pdf")
			expect(item?.path).toBe(path.resolve(savedPath))

			// 2. Download via path: must stream file with original name and MIME type
			const downloadReq = createMockReq({
				url: `/api/files/download?path=${encodeURIComponent(savedPath)}`,
				method: "GET",
			})
			const downloadRes = createMockRes()
			await handleFileDownload(downloadReq, downloadRes)
			await downloadRes.waitForEnd()

			expect(downloadRes.statusCode).toBe(200)
			expect(downloadRes.headers["Content-Type"]).toBe("application/pdf")
			const disposition = downloadRes.headers["Content-Disposition"] as string
			expect(disposition).toContain(`filename="${originalName}"`)
			expect(downloadRes.getBodyString()).toBe(content)
		})
	})

	describe("isPathInside root-safe containment", () => {
		it("correctly identifies paths inside directories and rejects traversal or external paths", () => {
			const baseDir = path.resolve(testUploadDir)
			const childFile = path.join(baseDir, "file.txt")
			const nestedFile = path.join(baseDir, "nested", "sub", "file.txt")
			const siblingDir = path.resolve(baseDir, "..", "sibling")
			const outsideFile = path.join(siblingDir, "file.txt")

			expect(isPathInside(childFile, baseDir)).toBe(true)
			expect(isPathInside(nestedFile, baseDir)).toBe(true)
			expect(isPathInside(baseDir, baseDir)).toBe(true)
			expect(isPathInside(outsideFile, baseDir)).toBe(false)
			expect(isPathInside(path.join(baseDir, "..", "evil.txt"), baseDir)).toBe(
				false,
			)

			// Filesystem root checks
			const root = path.parse(baseDir).root
			expect(isPathInside(baseDir, root)).toBe(true)
			expect(isPathInside(root, root)).toBe(true)
		})
	})
})
