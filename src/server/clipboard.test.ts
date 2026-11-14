import { EventEmitter } from "node:events"
import { ChildProcess, spawn } from "node:child_process"
import os from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getSystemClipboard, setSystemClipboard } from "./clipboard.ts"
import { Readable, Writable } from "node:stream"

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}))

vi.mock("node:os", () => ({
	default: {
		platform: vi.fn(),
	},
}))



function createMockProcess(options: {
	stdoutData?: string
	exitCode?: number
	failError?: Error | null
}): ChildProcess {
	const { stdoutData = "", exitCode = 0, failError = null } = options

	// Real streams, so future tests using pipe/read/write/end behave like production
	const stdout = new Readable({ read() {} })
	const stderr = new Readable({ read() {} })
	const stdin  = new Writable({
		write(_chunk, _encoding, callback) {
			callback()
		},
	})

	// Preserve the ability to assert that `stdin.end` was called
	vi.spyOn(stdin, "end")

	// Downcast is legitimate: ChildProcess extends EventEmitter. Every required
	// property is then supplied below with its real type — no `as unknown as`.
	const proc = new EventEmitter() as ChildProcess

	proc.stdin  = stdin
	proc.stdout = stdout
	proc.stderr = stderr
	proc.kill        = vi.fn()
	proc.send        = vi.fn()
	proc.disconnect  = vi.fn()
	proc.ref         = vi.fn()
	proc.unref       = vi.fn()

	// Readonly properties from @types/node — define them, don't cast
	Object.defineProperty(proc, "pid",        { value: 12345 })
	Object.defineProperty(proc, "killed",     { value: false })
	Object.defineProperty(proc, "connected",  { value: false })
	Object.defineProperty(proc, "exitCode",   { value: null })
	Object.defineProperty(proc, "signalCode", { value: null })
	Object.defineProperty(proc, "spawnfile",  { value: "mock" })
	Object.defineProperty(proc, "spawnargs",  { value: [] })
	Object.defineProperty(proc, "stdio",      { value: [null, stdout, stderr] })

	setTimeout(() => {
		if (failError) {
			proc.emit("error", failError)
		} else {
			if (stdoutData) {
				stdout.push(Buffer.from(stdoutData))
			}
			proc.emit("close", exitCode)
		}
	}, 1)

	return proc
}

describe("Clipboard helper", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.restoreAllMocks()
	})

	it("should read clipboard on darwin via pbpaste", async () => {
		vi.mocked(os.platform).mockReturnValue("darwin")
		vi.mocked(spawn).mockReturnValue(
			createMockProcess({ stdoutData: "macOS clipboard text" }),
		)

		const text = await getSystemClipboard()
		expect(text).toBe("macOS clipboard text")
		expect(spawn).toHaveBeenCalledWith("pbpaste", [], expect.any(Object))
	})

	it("should write clipboard on darwin via pbcopy", async () => {
		vi.mocked(os.platform).mockReturnValue("darwin")
		const mockProc = createMockProcess({ exitCode: 0 })
		vi.mocked(spawn).mockReturnValue(mockProc)

		await setSystemClipboard("test text")
		expect(spawn).toHaveBeenCalledWith("pbcopy", [], expect.any(Object))
		expect(mockProc.stdin!.end).toHaveBeenCalledWith("test text", "utf-8")
	})

	it("should read clipboard on win32 via powershell", async () => {
		vi.mocked(os.platform).mockReturnValue("win32")
		vi.mocked(spawn).mockReturnValue(
			createMockProcess({ stdoutData: "windows clipboard text\r\n" }),
		)

		const text = await getSystemClipboard()
		expect(text).toBe("windows clipboard text")
		expect(spawn).toHaveBeenCalledWith(
			"powershell.exe",
			expect.arrayContaining([
				expect.stringMatching(
					/\[Console\]::OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8;\s*Get-Clipboard -Raw/,
				),
			]),
			expect.objectContaining({ windowsHide: true }),
		)
	})

	it("should keep a character split across stdout chunks", async () => {
		vi.mocked(os.platform).mockReturnValue("win32")
		const proc = createMockProcess({})
		vi.mocked(spawn).mockReturnValue(proc)
		const rocket = Buffer.from("🚀")

		const pending = getSystemClipboard()
		proc.stdout!.emit("data", rocket.subarray(0, 2))
		proc.stdout!.emit("data", rocket.subarray(2))

		await expect(pending).resolves.toBe("🚀")
	})

	it("should read clipboard on linux using fallback when first command fails", async () => {
		vi.mocked(os.platform).mockReturnValue("linux")
		const origEnv = process.env.XDG_SESSION_TYPE
		process.env.XDG_SESSION_TYPE = "wayland"

		// First call (wl-paste) fails with non-zero exit code, second call (xclip) succeeds
		vi.mocked(spawn)
			.mockReturnValueOnce(createMockProcess({ exitCode: 1 }))
			.mockReturnValueOnce(createMockProcess({ stdoutData: "xclip text" }))

		const text = await getSystemClipboard()
		expect(text).toBe("xclip text")
		expect(spawn).toHaveBeenCalledTimes(2)

		process.env.XDG_SESSION_TYPE = origEnv
	})

	it("should reject when all clipboard write commands fail on linux", async () => {
		vi.mocked(os.platform).mockReturnValue("linux")
		delete process.env.XDG_SESSION_TYPE

		// Both xclip and xsel fail
		vi.mocked(spawn)
			.mockReturnValueOnce(createMockProcess({ exitCode: 1 }))
			.mockReturnValueOnce(createMockProcess({ exitCode: 1 }))

		await expect(setSystemClipboard("fail text")).rejects.toThrow()
	})
})
