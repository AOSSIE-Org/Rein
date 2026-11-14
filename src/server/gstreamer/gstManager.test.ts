import type { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WindowsInput, WindowsMouseInput } from "@imxade/inject/windows"
import {
	getActiveDisplayState,
	setActiveDisplayState,
	type ServerConfig,
} from "../../utils/configHelper.ts"
import { MOUSEEVENTF_VIRTUALDESK } from "../drivers/windows/constants.ts"

const mocks = vi.hoisted(() => {
	const spawnedProcs: Array<
		EventEmitter & {
			stdout: EventEmitter
			stderr: EventEmitter
			exitCode: number | null
			kill: ReturnType<typeof vi.fn>
		}
	> = []
	const savedConfig: { current: ServerConfig } = {
		current: { displayMode: "extended", monitorIndex: 1 },
	}
	const sendInput = vi.fn((events: WindowsInput[]) => events.length)
	return { spawnedProcs, savedConfig, sendInput }
})

vi.mock("@imxade/inject/windows", () => ({
	sendInput: (events: WindowsInput[]) => mocks.sendInput(events),
	INPUT_MOUSE: 0,
	INPUT_KEYBOARD: 1,
	MOUSEEVENTF_MOVE: 0x0001,
	MOUSEEVENTF_LEFTDOWN: 0x0002,
	MOUSEEVENTF_LEFTUP: 0x0004,
	MOUSEEVENTF_RIGHTDOWN: 0x0008,
	MOUSEEVENTF_RIGHTUP: 0x0010,
	MOUSEEVENTF_MIDDLEDOWN: 0x0020,
	MOUSEEVENTF_MIDDLEUP: 0x0040,
	MOUSEEVENTF_WHEEL: 0x0800,
	MOUSEEVENTF_HWHEEL: 0x1000,
	MOUSEEVENTF_ABSOLUTE: 0x8000,
	KEYEVENTF_EXTENDEDKEY: 0x0001,
	KEYEVENTF_KEYUP: 0x0002,
	KEYEVENTF_UNICODE: 0x0004,
	KEYEVENTF_SCANCODE: 0x0008,
}))

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
	const { EventEmitter: EE } = await import("node:events")
	return {
		...actual,
		spawn: vi.fn(() => {
			const proc = Object.assign(new EE(), {
				stdout: new EE(),
				stderr: new EE(),
				exitCode: null as number | null,
				kill: vi.fn(),
			})
			proc.kill.mockImplementation(() => {
				proc.exitCode = 0
				proc.emit("close", 0)
				return true
			})
			mocks.spawnedProcs.push(proc)
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
		loadServerConfig: vi.fn(() => mocks.savedConfig.current),
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
		mocks.spawnedProcs.length = 0
		mocks.sendInput.mockClear()
		setActiveDisplayState(null)
		mocks.savedConfig.current = { displayMode: "extended", monitorIndex: 1 }
	})

	afterEach(() => {
		vi.useRealTimers()
		setActiveDisplayState(null)
		if (originalPlatformDescriptor) {
			Object.defineProperty(process, "platform", originalPlatformDescriptor)
		}
	})

	it("syncs input state on fallback and restores on start", async () => {
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
		const before = getMouseInput(mocks.sendInput.mock.calls[0][0][0])
		expect(before.dwFlags & MOUSEEVENTF_VIRTUALDESK).toBe(
			MOUSEEVENTF_VIRTUALDESK,
		)

		// Trigger GStreamer non-zero exit fallback to monitor 0
		mocks.spawnedProcs[0].exitCode = 1
		mocks.spawnedProcs[0].emit("close", 1)
		await vi.advanceTimersByTimeAsync(350)

		expect(getActiveDisplayState()).toEqual({
			displayMode: "duplicate",
			monitorIndex: 0,
		})
		expect(mocks.savedConfig.current.displayMode).toBe("extended")

		// After fallback: absolute clicks target primary display (no VIRTUALDESK)
		mocks.sendInput.mockClear()
		injector.injectMouseAbsolute(960, 540)
		const after = getMouseInput(mocks.sendInput.mock.calls[0][0][0])
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
		mocks.sendInput.mockClear()
		injector.injectMouseAbsolute(960, 540)
		const restored = getMouseInput(mocks.sendInput.mock.calls[0][0][0])
		expect(restored.dwFlags & MOUSEEVENTF_VIRTUALDESK).toBe(
			MOUSEEVENTF_VIRTUALDESK,
		)

		await gst.stop()
	})
})
