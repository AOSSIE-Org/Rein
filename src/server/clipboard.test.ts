import { EventEmitter } from "node:events"
import { ChildProcess, spawn } from "node:child_process"
import os from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getSystemClipboard, setSystemClipboard } from "./clipboard.ts"

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}))

vi.mock("node:os", () => ({
	default: {
		platform: vi.fn(),
	},
}))

type MockChildProcess = ChildProcess & {
  stdin: NonNullable<ChildProcess['stdin']>;
  stdout: NonNullable<ChildProcess['stdout']>;
  stderr: NonNullable<ChildProcess['stderr']>;
};


function createMockProcess(options: {
	stdoutData?: string
	exitCode?: number
	failError?: Error | null
}): MockChildProcess {
	const { stdoutData = "", exitCode = 0, failError = null } = options

	const proc = new EventEmitter()          // plain EventEmitter, no cast
	const stdout = new EventEmitter()        // plain EventEmitter, no cast
	const stdin  = { on: vi.fn(), end: vi.fn() }
	const stderr = new EventEmitter()

	setTimeout(() => {
		if (failError) {
			proc.emit("error", failError)
		} else {
			if (stdoutData) {
				stdout.emit("data", Buffer.from(stdoutData))
			}
			proc.emit("close", exitCode)
		}
	}, 1)

	// Single cast, at the boundary
	return Object.assign(proc, { stdout, stdin, stderr }) as unknown as MockChildProcess
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
		expect(mockProc.stdin.end).toHaveBeenCalledWith("test text", "utf-8")
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
		proc.stdout.emit("data", rocket.subarray(0, 2))
		proc.stdout.emit("data", rocket.subarray(2))

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
