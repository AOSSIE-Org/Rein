import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseFirstPartHeaders, writeFileExclusive } from "./fileShare.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal multipart/form-data body Buffer with a single file part.
 * The header is encoded as UTF-8 bytes (as a real browser sends), so the
 * parser must correctly re-decode binary/latin-1 body bytes back to UTF-8.
 */
function buildMultipartBody(
	boundary: string,
	filename: string,
	content: Buffer,
	mimeType = "application/octet-stream",
): Buffer {
	const headerStr = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
	const footer = `\r\n--${boundary}--\r\n`
	return Buffer.concat([
		Buffer.from(headerStr, "utf8"),
		content,
		Buffer.from(footer, "utf8"),
	])
}

/**
 * Builds a multipart body using an RFC 5987 filename* parameter.
 */
function buildMultipartBodyRfc5987(
	boundary: string,
	encodedFilename: string,
	content: Buffer,
): Buffer {
	const headerStr = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename*=UTF-8''${encodedFilename}\r\nContent-Type: application/octet-stream\r\n\r\n`
	const footer = `\r\n--${boundary}--\r\n`
	return Buffer.concat([
		Buffer.from(headerStr, "utf8"),
		content,
		Buffer.from(footer, "utf8"),
	])
}

// ---------------------------------------------------------------------------
// parseFirstPartHeaders
// ---------------------------------------------------------------------------

describe("parseFirstPartHeaders", () => {
	const BND = "testboundary"
	const CONTENT = Buffer.from("hello world")

	it("preserves ASCII filenames", () => {
		const body = buildMultipartBody(BND, "document.pdf", CONTENT)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe("document.pdf")
	})

	it("preserves UTF-8 accented characters (résumé.pdf)", () => {
		const filename = "résumé.pdf"
		const body = buildMultipartBody(BND, filename, CONTENT)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		// Before the fix this would return "rÃ©sumÃ©.pdf" (latin-1 corruption)
		expect(result.name).toBe(filename)
	})

	it("preserves CJK characters (照片.jpg)", () => {
		const filename = "照片.jpg"
		const body = buildMultipartBody(BND, filename, CONTENT)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe(filename)
	})

	it("preserves emoji in filename (🎉party.jpg)", () => {
		const filename = "🎉party.jpg"
		const body = buildMultipartBody(BND, filename, CONTENT)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe(filename)
	})

	it("handles RFC 5987 filename* parameter (percent-encoded UTF-8)", () => {
		// filename*=UTF-8''r%C3%A9sum%C3%A9.pdf  → résumé.pdf
		const encoded = "r%C3%A9sum%C3%A9.pdf"
		const body = buildMultipartBodyRfc5987(BND, encoded, CONTENT)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe("résumé.pdf")
	})

	it("RFC 5987 filename* takes priority over plain filename= when both present", () => {
		// Build a body with BOTH filename= and filename*=
		const headerStr = `--${BND}\r\nContent-Disposition: form-data; name="file"; filename="fallback.pdf"; filename*=UTF-8''priority.pdf\r\nContent-Type: application/octet-stream\r\n\r\n`
		const footer = `\r\n--${BND}--\r\n`
		const body = Buffer.concat([
			Buffer.from(headerStr, "utf8"),
			CONTENT,
			Buffer.from(footer, "utf8"),
		])
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe("priority.pdf")
	})

	it("falls back to 'file' when no filename is present", () => {
		const headerStr = `--${BND}\r\nContent-Disposition: form-data; name="file"\r\nContent-Type: application/octet-stream\r\n\r\n`
		const footer = `\r\n--${BND}--\r\n`
		const body = Buffer.concat([
			Buffer.from(headerStr, "utf8"),
			CONTENT,
			Buffer.from(footer, "utf8"),
		])
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.name).toBe("file")
	})

	it("extracts the correct Content-Type", () => {
		const body = buildMultipartBody(BND, "photo.jpg", CONTENT, "image/jpeg")
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.mimeType).toBe("image/jpeg")
	})

	it("defaults Content-Type to application/octet-stream when absent", () => {
		const headerStr = `--${BND}\r\nContent-Disposition: form-data; name="file"; filename="data.bin"\r\n\r\n`
		const footer = `\r\n--${BND}--\r\n`
		const body = Buffer.concat([
			Buffer.from(headerStr, "utf8"),
			CONTENT,
			Buffer.from(footer, "utf8"),
		])
		const result = parseFirstPartHeaders(body, `--${BND}`)
		expect(result.mimeType).toBe("application/octet-stream")
	})

	it("preserves binary file content exactly (byte-level integrity)", () => {
		// Mix of arbitrary bytes including 0xC3 0xA9 (UTF-8 for é) to verify
		// the byte extraction does not corrupt binary data
		const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xc3, 0xa9])
		const body = buildMultipartBody(BND, "test.bin", binary)
		const result = parseFirstPartHeaders(body, `--${BND}`)
		const extracted = body.slice(result.dataStart, result.dataEnd)
		expect(extracted).toEqual(binary)
	})

	it("throws on malformed body (no boundary)", () => {
		const body = Buffer.from("not a valid multipart body")
		expect(() => parseFirstPartHeaders(body, "--missing")).toThrow(
			"Malformed multipart body",
		)
	})

	it("throws on malformed headers (no blank line separator)", () => {
		// boundary present but no \r\n\r\n after headers
		const body = Buffer.from(`--${BND}\r\nContent-Disposition: form-data`)
		expect(() => parseFirstPartHeaders(body, `--${BND}`)).toThrow(
			"Malformed multipart headers",
		)
	})
})

// ---------------------------------------------------------------------------
// writeFileExclusive
// ---------------------------------------------------------------------------

describe("writeFileExclusive", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rein-test-"))
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("saves a file with the exact requested name on first upload", async () => {
		const data = Buffer.from("first content")
		const saved = await writeFileExclusive(tmpDir, "report.pdf", data)
		expect(saved).toBe("report.pdf")
		const onDisk = await fs.readFile(path.join(tmpDir, "report.pdf"))
		expect(onDisk).toEqual(data)
	})

	it("appends (1) on second upload with same name", async () => {
		const data = Buffer.from("content")
		await writeFileExclusive(tmpDir, "report.pdf", data)
		const saved = await writeFileExclusive(tmpDir, "report.pdf", data)
		// stem="report", ext=".pdf" → "report (1).pdf"
		expect(saved).toBe("report (1).pdf")
	})

	it("appends (2) on third upload with same name", async () => {
		const data = Buffer.from("content")
		await writeFileExclusive(tmpDir, "report.pdf", data)
		await writeFileExclusive(tmpDir, "report.pdf", data)
		const saved = await writeFileExclusive(tmpDir, "report.pdf", data)
		// stem="report", ext=".pdf" → "report (2).pdf"
		expect(saved).toBe("report (2).pdf")
	})

	it("does not overwrite original file content", async () => {
		const original = Buffer.from("original")
		const second = Buffer.from("second upload")
		await writeFileExclusive(tmpDir, "file.txt", original)
		await writeFileExclusive(tmpDir, "file.txt", second)
		const onDisk = await fs.readFile(path.join(tmpDir, "file.txt"))
		expect(onDisk).toEqual(original)
	})

	it("handles concurrent uploads — all files are preserved", async () => {
		const writes = Array.from({ length: 5 }, (_, i) =>
			writeFileExclusive(tmpDir, "concurrent.bin", Buffer.from(`data-${i}`)),
		)
		const names = await Promise.all(writes)
		// All returned names must be unique
		const unique = new Set(names)
		expect(unique.size).toBe(5)
		// All files must exist on disk
		for (const name of names) {
			const stat = await fs.stat(path.join(tmpDir, name))
			expect(stat.isFile()).toBe(true)
		}
	})

	it("propagates non-EEXIST errors (write to non-existent directory)", async () => {
		const badDir = path.join(tmpDir, "does-not-exist")
		await expect(
			writeFileExclusive(badDir, "file.txt", Buffer.from("x")),
		).rejects.toThrow()
	})

	it("handles extensionless filenames correctly (notes → notes (1))", async () => {
		const data = Buffer.from("content")
		await writeFileExclusive(tmpDir, "notes", data)
		const saved = await writeFileExclusive(tmpDir, "notes", data)
		expect(saved).toBe("notes (1)")
	})

	it("handles dotfiles correctly (.gitignore → .gitignore (1))", async () => {
		const data = Buffer.from("content")
		await writeFileExclusive(tmpDir, ".gitignore", data)
		const saved = await writeFileExclusive(tmpDir, ".gitignore", data)
		expect(saved).toBe(".gitignore (1)")
	})

	it("handles double extensions correctly (archive.tar.gz → archive.tar (1).gz)", async () => {
		const data = Buffer.from("content")
		await writeFileExclusive(tmpDir, "archive.tar.gz", data)
		const saved = await writeFileExclusive(tmpDir, "archive.tar.gz", data)
		expect(saved).toBe("archive.tar (1).gz")
	})
})

// ---------------------------------------------------------------------------
// Sanitization logic (tested as pure string transforms, matching handleFileUpload)
// ---------------------------------------------------------------------------

describe("filename sanitization logic", () => {
	/**
	 * Mirrors the sanitization applied in handleFileUpload so we can verify
	 * it without spinning up an HTTP server.
	 */
	function sanitize(raw: string): string {
		const normalized = raw.replace(/\\/g, "/")
		const safe = path.basename(normalized)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control code range \u0000-\u001f
		const ctrlRe = /[\u0000-\u001f\u007f/\\]/g
		const sanitized = safe.replace(ctrlRe, "_")
		return Buffer.from(sanitized, "utf8").slice(0, 255).toString("utf8")
	}

	it("strips path traversal (../secret.txt → secret.txt)", () => {
		expect(sanitize("../secret.txt")).toBe("secret.txt")
	})

	it("strips deep path traversal (../../outside.txt → outside.txt)", () => {
		expect(sanitize("../../outside.txt")).toBe("outside.txt")
	})

	it("strips absolute path prefix (/etc/passwd → passwd)", () => {
		expect(sanitize("/etc/passwd")).toBe("passwd")
	})

	it("handles Windows-style path traversal (..\\\\secret.txt → secret.txt)", () => {
		expect(sanitize("..\\secret.txt")).toBe("secret.txt")
	})

	it("replaces null byte control chars (\\x00evil.txt → _evil.txt)", () => {
		expect(sanitize("\x00evil.txt")).toBe("_evil.txt")
	})

	it("replaces other control chars (\\x1ftest.txt → _test.txt)", () => {
		expect(sanitize("\x1ftest.txt")).toBe("_test.txt")
	})

	it("truncates filename to 255 bytes", () => {
		// 300 ASCII chars → truncated to 255
		const long = `${"a".repeat(300)}.txt`
		const result = sanitize(long)
		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(255)
	})

	it("preserves UTF-8 filename after sanitization (no corruption)", () => {
		expect(sanitize("résumé.pdf")).toBe("résumé.pdf")
	})
})
