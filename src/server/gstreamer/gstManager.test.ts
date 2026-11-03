import { execSync, spawnSync } from "node:child_process"
import os from "node:os"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GstManager, probeGstreamer } from "./gstManager.ts"

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
	execSync: vi.fn(),
}))

vi.mock("../../utils/logger.ts", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}))

vi.mock("../../utils/configHelper.ts", () => ({
	loadServerConfig: vi.fn(() => ({})),
}))

interface GstManagerPrivate {
	getAudioSourceBlocks: (cfg: Record<string, unknown>) => string[]
}

function spawnResult(
	status: number | null,
	error?: Error,
): ReturnType<typeof spawnSync> {
	return {
		pid: 0,
		output: [],
		stdout: Buffer.alloc(0),
		stderr: Buffer.alloc(0),
		status,
		signal: null,
		error,
	}
}

describe("probeGstreamer", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns ok: true when gst-launch-1.0 exits with 0", () => {
		vi.mocked(spawnSync).mockReturnValue(spawnResult(0))

		const result = probeGstreamer()
		expect(result.ok).toBe(true)
		expect(result.error).toBeUndefined()
	})

	it("returns ok: false when binary is not found", () => {
		vi.mocked(spawnSync).mockReturnValue(spawnResult(null, new Error("ENOENT")))

		const result = probeGstreamer()
		expect(result.ok).toBe(false)
		expect(result.error).toContain("not found on system PATH")
	})

	it("returns ok: false when binary exits with non-zero code", () => {
		vi.mocked(spawnSync).mockReturnValue(spawnResult(1))

		const result = probeGstreamer()
		expect(result.ok).toBe(false)
		expect(result.error).toContain("exited with code 1")
	})
})

describe("GstManager - Audio source detection on Linux", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("detects default PulseAudio/PipeWire monitor sink using execSync on Linux", () => {
		const originalPlatform = os.platform
		try {
			os.platform = () => "linux"

			vi.mocked(execSync).mockReturnValue(
				"alsa_output.pci-0000_00_1f.3.analog-stereo\n",
			)

			const manager = new GstManager()
			const blocks = (
				manager as unknown as GstManagerPrivate
			).getAudioSourceBlocks({})

			expect(execSync).toHaveBeenCalledWith(
				"pactl get-default-sink",
				expect.objectContaining({
					encoding: "utf-8",
				}),
			)
			expect(blocks).toEqual([
				"pulsesrc",
				"device=alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
			])
		} finally {
			os.platform = originalPlatform
		}
	})

	it("falls back to pulsesrc if execSync throws or pactl fails", () => {
		const originalPlatform = os.platform
		try {
			os.platform = () => "linux"

			vi.mocked(execSync).mockImplementation(() => {
				throw new Error("pactl: command not found")
			})

			const manager = new GstManager()
			const blocks = (
				manager as unknown as GstManagerPrivate
			).getAudioSourceBlocks({})

			expect(blocks).toEqual(["pulsesrc"])
		} finally {
			os.platform = originalPlatform
		}
	})

	it("respects custom audioSource if specified in config", () => {
		const manager = new GstManager()
		const blocks = (
			manager as unknown as GstManagerPrivate
		).getAudioSourceBlocks({
			audioSource: "customaudiosrc device=hw:0",
		})
		expect(blocks).toEqual(["customaudiosrc", "device=hw:0"])
	})
})
