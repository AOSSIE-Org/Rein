import { EventEmitter } from "node:events"
import { spawn } from "node:child_process"
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

interface MockChildProcess extends EventEmitter {
	stdout: EventEmitter
	stdin: {
		on: ReturnType<typeof vi.fn>
		end: ReturnType<typeof vi.fn>
	}
}

function createMockProcess(options: {
	stdoutData?: string
	exitCode?: number
	failError?: Error | null
}) {
	const { stdoutData = "", exitCode = 0, failError = null } = options
	const proc = new EventEmitter() as unknown as MockChildProcess
	proc.stdout = new EventEmitter()
	proc.stdin = {
		on: vi.fn(),
		end: vi.fn(),
	}

	setTimeout(() => {
		if (failError) {
			proc.emit("error", failError)
		} else {
			if (stdoutData) {
				proc.stdout.emit("data", Buffer.from(stdoutData))
			}
			proc.emit("close", exitCode)
		}
	}, 1)

	return proc
}

describe("Clipboard helper", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
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
			expect.arrayContaining(["Get-Clipboard -Raw"]),
			expect.any(Object),
		)
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
