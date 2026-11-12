import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WindowsInput, WindowsMouseInput } from "@imxade/inject/windows"
import {
	getActiveDisplayState,
	setActiveDisplayState,
	type ServerConfig,
} from "../../utils/configHelper.ts"
import { MOUSEEVENTF_VIRTUALDESK } from "../drivers/windows/constants.ts"

class MockChildProcess extends EventEmitter {
	public stdout = new EventEmitter()
	public stderr = new EventEmitter()
	public exitCode: number | null = null
	public kill = vi.fn(() => {
		this.exitCode = 0
		this.emit("close", 0)
		return true
	})
}

const spawnedProcs: MockChildProcess[] = []
const mockSendInput = vi.fn((events: WindowsInput[]) => events.length)
let savedConfigMock: ServerConfig = {
	displayMode: "extended",
	monitorIndex: 1,
}

vi.mock("@imxade/inject/windows", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@imxade/inject/windows")>()
	return {
		...actual,
		sendInput: (events: WindowsInput[]) => mockSendInput(events),
	}
})

vi.mock("../drivers/windows/touch.ts", () => ({
	WindowsTouch: class {
		destroy() {}
	},
}))

vi.mock("../drivers/windows/gamepad.ts", () => ({
	WindowsGamepad: class {
		destroy() {}
	},
}))

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>()
	return {
		...actual,
		spawn: vi.fn(() => {
			const proc = new MockChildProcess()
			spawnedProcs.push(proc)
			return proc
		}),
		spawnSync: vi.fn(() => ({ status: 0 })),
		execSync: vi.fn(() => ""),
	}
})

vi.mock("../../utils/configHelper.ts", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../utils/configHelper.ts")>()
	return {
		...actual,
		loadServerConfig: vi.fn(() => savedConfigMock),
	}
})

vi.mock("./captureProvider.ts", () => ({
	createCaptureProvider: vi.fn((monitorIndex = 0) => ({
		initialize: vi.fn(async () => {}),
		getGStreamerSource: vi.fn(async () => [
			"d3d11screencapturesrc",
			`monitor-index=${monitorIndex}`,
		]),
		dispose: vi.fn(async () => {}),
	})),
}))

vi.mock("../../utils/logger.ts", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}))

import { GstManager } from "./gstManager.ts"

function getMouseInput(event: WindowsInput): WindowsMouseInput {
	if (!("mi" in event.u)) {
		throw new Error("Expected mouse input event")
	}
	return event.u.mi
}

describe("GstManager - Fallback Input Synchronization", () => {
	const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
		process,
		"platform",
	)

	beforeEach(() => {
		spawnedProcs.length = 0
		mockSendInput.mockClear()
		setActiveDisplayState(null)
		savedConfigMock = { displayMode: "extended", monitorIndex: 1 }
	})

	afterEach(() => {
		vi.useRealTimers()
		setActiveDisplayState(null)
		if (originalPlatformDescriptor) {
			Object.defineProperty(process, "platform", originalPlatformDescriptor)
		}
	})

	it("syncs WindowsInputInjector to Display 0 on fallback and restores on start", async () => {
		vi.useFakeTimers()
		Object.defineProperty(process, "platform", {
			value: "win32",
			configurable: true,
		})
		const { WindowsInputInjector } = await import("../drivers/windows/index.ts")
		const injector = new WindowsInputInjector({
			screenWidth: 1920,
			screenHeight: 1080,
		})

		const gst = new GstManager()
		await gst.start()
		expect(getActiveDisplayState()).toEqual({
			displayMode: "extended",
			monitorIndex: 1,
		})

		// Before fallback: absolute clicks target extended display (VIRTUALDESK)
		injector.injectMouseAbsolute(960, 540)
		const before = getMouseInput(mockSendInput.mock.calls[0][0][0])
		expect(before.dwFlags & MOUSEEVENTF_VIRTUALDESK).toBe(
			MOUSEEVENTF_VIRTUALDESK,
		)

		// Trigger GStreamer non-zero exit fallback to monitor 0
		spawnedProcs[0].exitCode = 1
		spawnedProcs[0].emit("close", 1)
		await vi.advanceTimersByTimeAsync(350)

		expect(getActiveDisplayState()).toEqual({
			displayMode: "duplicate",
			monitorIndex: 0,
		})
		expect(savedConfigMock.displayMode).toBe("extended")

		// After fallback: absolute clicks target primary display (no VIRTUALDESK)
		mockSendInput.mockClear()
		injector.injectMouseAbsolute(960, 540)
		const after = getMouseInput(mockSendInput.mock.calls[0][0][0])
		expect(after.dwFlags & MOUSEEVENTF_VIRTUALDESK).toBe(0)
		expect(after.dx).toBe(32768)

		await gst.stop()
		expect(getActiveDisplayState()).toBeNull()

		// Normal capture startup restores extended state from saved preference
		await gst.start()
		expect(getActiveDisplayState()).toEqual({
			displayMode: "extended",
			monitorIndex: 1,
		})
		mockSendInput.mockClear()
		injector.injectMouseAbsolute(960, 540)
		const restored = getMouseInput(mockSendInput.mock.calls[0][0][0])
		expect(restored.dwFlags & MOUSEEVENTF_VIRTUALDESK).toBe(
			MOUSEEVENTF_VIRTUALDESK,
		)

		await gst.stop()
	})
})
