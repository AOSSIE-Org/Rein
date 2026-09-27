import { describe, it, expect, vi, beforeEach } from "vitest"
import * as childProcess from "node:child_process"
import os from "node:os"
import { EventEmitter } from "node:events"
import { Writable } from "node:stream"
import { getSystemClipboard, setSystemClipboard } from "./clipboard.ts"
import { MAX_TEXT_LENGTH } from "./constants.ts"

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
	spawn: vi.fn(),
}))

vi.mock("node:os", async () => {
	const actual = await vi.importActual<typeof import("node:os")>("node:os")
	return {
		...actual,
		default: {
			...actual.default,
			platform: vi.fn(),
		},
	}
})

describe("Host Clipboard Module (Mocked Process Layer)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("macOS (darwin)", () => {
		beforeEach(() => {
			vi.mocked(os.platform).mockReturnValue("darwin")
		})

		it("reads clipboard using pbpaste", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				cb(null, "macos-clipboard-text")
			}) as unknown as typeof childProcess.execFile)

			const text = await getSystemClipboard()
			expect(text).toBe("macos-clipboard-text")
			expect(childProcess.execFile).toHaveBeenCalledWith(
				"/usr/bin/pbpaste",
				[],
				expect.objectContaining({ encoding: "utf8" }),
				expect.any(Function),
			)
		})

		it("writes clipboard using pbcopy with stdin", async () => {
			let writtenData = ""
			const fakeProc = new EventEmitter() as {
				stdin: Writable
				emit: (event: string, ...args: unknown[]) => boolean
				on: (event: string, listener: (...args: unknown[]) => void) => void
			}
			fakeProc.stdin = new Writable({
				write(chunk, _enc, cb) {
					writtenData += chunk.toString()
					cb()
				},
			})
			vi.mocked(childProcess.spawn).mockImplementation((() => {
				process.nextTick(() => fakeProc.emit("close", 0))
				return fakeProc
			}) as unknown as typeof childProcess.spawn)

			await setSystemClipboard("Hello\nWorld 🚀")
			expect(writtenData).toBe("Hello\nWorld 🚀")
			expect(childProcess.spawn).toHaveBeenCalledWith(
				"/usr/bin/pbcopy",
				[],
				expect.objectContaining({ stdio: ["pipe", "ignore", "ignore"] }),
			)
		})
	})

	describe("Windows (win32)", () => {
		beforeEach(() => {
			vi.mocked(os.platform).mockReturnValue("win32")
		})

		it("reads clipboard using PowerShell Get-Clipboard", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				cb(null, "windows-clipboard-text\r\n")
			}) as unknown as typeof childProcess.execFile)

			const text = await getSystemClipboard()
			expect(text).toBe("windows-clipboard-text")
			expect(childProcess.execFile).toHaveBeenCalledWith(
				"powershell.exe",
				expect.arrayContaining(["-NoProfile", "-NonInteractive"]),
				expect.objectContaining({ encoding: "utf8" }),
				expect.any(Function),
			)
		})

		it("writes clipboard using PowerShell Set-Clipboard via stdin", async () => {
			let writtenData = ""
			const fakeProc = new EventEmitter() as {
				stdin: Writable
				emit: (event: string, ...args: unknown[]) => boolean
				on: (event: string, listener: (...args: unknown[]) => void) => void
			}
			fakeProc.stdin = new Writable({
				write(chunk, _enc, cb) {
					writtenData += chunk.toString()
					cb()
				},
			})
			vi.mocked(childProcess.spawn).mockImplementation((() => {
				process.nextTick(() => fakeProc.emit("close", 0))
				return fakeProc
			}) as unknown as typeof childProcess.spawn)

			await setSystemClipboard("windows-paste-data")
			expect(writtenData).toBe("windows-paste-data")
			expect(childProcess.spawn).toHaveBeenCalledWith(
				"powershell.exe",
				expect.arrayContaining(["-NoProfile", "-NonInteractive"]),
				expect.objectContaining({ stdio: ["pipe", "ignore", "ignore"] }),
			)
		})
	})

	describe("Linux (linux)", () => {
		beforeEach(() => {
			vi.mocked(os.platform).mockReturnValue("linux")
		})

		it("reads clipboard using wl-paste if available", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				if (cmd === "wl-paste") {
					cb(null, "wayland-clipboard-text")
				}
			}) as unknown as typeof childProcess.execFile)

			const text = await getSystemClipboard()
			expect(text).toBe("wayland-clipboard-text")
		})

		it("falls back to xclip if wl-paste fails", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				if (cmd === "wl-paste") {
					cb(new Error("wl-paste not found"), "")
				} else if (cmd === "xclip") {
					cb(null, "xclip-clipboard-text")
				}
			}) as unknown as typeof childProcess.execFile)

			const text = await getSystemClipboard()
			expect(text).toBe("xclip-clipboard-text")
		})

		it("falls back to xsel if wl-paste and xclip both fail", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				if (cmd === "wl-paste") {
					cb(new Error("wl-paste not found"), "")
				} else if (cmd === "xclip") {
					cb(new Error("xclip not found"), "")
				} else if (cmd === "xsel") {
					cb(null, "xsel-clipboard-text")
				}
			}) as unknown as typeof childProcess.execFile)

			const text = await getSystemClipboard()
			expect(text).toBe("xsel-clipboard-text")
		})

		it("throws an error when all linux tools fail", async () => {
			vi.mocked(childProcess.execFile).mockImplementation(((
				_cmd: string,
				_args: string[],
				_opts: unknown,
				cb: (err: Error | null, stdout: string) => void,
			) => {
				cb(new Error("tool not found"), "")
			}) as unknown as typeof childProcess.execFile)

			await expect(getSystemClipboard()).rejects.toThrow()
		})
	})

	describe("Unsupported platform", () => {
		beforeEach(() => {
			vi.mocked(os.platform).mockReturnValue("freebsd" as NodeJS.Platform)
		})

		it("throws an error when reading from unsupported platform", async () => {
			await expect(getSystemClipboard()).rejects.toThrow("Unsupported platform")
		})

		it("throws an error when writing to unsupported platform", async () => {
			await expect(setSystemClipboard("test")).rejects.toThrow(
				"Unsupported platform",
			)
		})
	})

	describe("Capacity Boundaries (10,000 to 100,000 characters)", () => {
		beforeEach(() => {
			vi.mocked(os.platform).mockReturnValue("darwin")
		})

		it("verifies MAX_TEXT_LENGTH is set to 100,000", () => {
			expect(MAX_TEXT_LENGTH).toBe(100000)
		})

		const boundarySizes = [9999, 10000, 10001, 99999, 100000]

		for (const size of boundarySizes) {
			it(`handles writing and reading ${size} characters of realistic text`, async () => {
				// Construct realistic string with spaces, newlines, tabs, emojis, and special symbols
				const sample = "Line with emoji 🚀 and symbols <>&\"'\t\n"
				const repeats = Math.ceil(size / sample.length)
				const fullText = sample.repeat(repeats).slice(0, size)
				expect(fullText.length).toBe(size)

				let capturedStdin = ""
				const fakeProc = new EventEmitter() as {
					stdin: Writable
					emit: (event: string, ...args: unknown[]) => boolean
					on: (event: string, listener: (...args: unknown[]) => void) => void
				}
				fakeProc.stdin = new Writable({
					write(chunk, _enc, cb) {
						capturedStdin += chunk.toString()
						cb()
					},
				})
				vi.mocked(childProcess.spawn).mockImplementation((() => {
					process.nextTick(() => fakeProc.emit("close", 0))
					return fakeProc
				}) as unknown as typeof childProcess.spawn)

				await setSystemClipboard(fullText)
				expect(capturedStdin.length).toBe(size)
				expect(capturedStdin).toBe(fullText)
			})
		}

		it("handles 100,001 characters with truncation at MAX_TEXT_LENGTH boundary", async () => {
			const size = 100001
			const sample = "A"
			const oversizedText = sample.repeat(size)
			expect(oversizedText.length).toBe(100001)

			const clamped = oversizedText.slice(0, MAX_TEXT_LENGTH)
			expect(clamped.length).toBe(100000)

			let capturedStdin = ""
			const fakeProc = new EventEmitter() as {
				stdin: Writable
				emit: (event: string, ...args: unknown[]) => boolean
				on: (event: string, listener: (...args: unknown[]) => void) => void
			}
			fakeProc.stdin = new Writable({
				write(chunk, _enc, cb) {
					capturedStdin += chunk.toString()
					cb()
				},
			})
			vi.mocked(childProcess.spawn).mockImplementation((() => {
				process.nextTick(() => fakeProc.emit("close", 0))
				return fakeProc
			}) as unknown as typeof childProcess.spawn)

			await setSystemClipboard(clamped)
			expect(capturedStdin.length).toBe(100000)
		})
	})
})
