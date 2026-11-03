// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWebRtcStream } from "./useWebRtcStream"

const mockRegisterDataChannel = vi.fn()
const mockUnregisterDataChannels = vi.fn()
const mockSend = vi.fn()

vi.mock("../contexts/ConnectionProvider", () => ({
	useConnection: () => ({
		status: "connected",
		latency: null,
		send: mockSend,
		registerDataChannel: mockRegisterDataChannel,
		unregisterDataChannels: mockUnregisterDataChannels,
	}),
}))

vi.mock("../utils/i18n", () => ({
	t: (_cat: string, key: string) => key,
}))

class MockRTCPeerConnection {
	ontrack: unknown = null
	ondatachannel: unknown = null
	onicecandidate: unknown = null
	onconnectionstatechange: unknown = null
	close = vi.fn()
	setRemoteDescription = vi.fn().mockResolvedValue(undefined)
	createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "" })
	setLocalDescription = vi.fn().mockResolvedValue(undefined)
	getStats = vi.fn().mockResolvedValue(new Map())
}

class MockEventSource {
	onmessage: unknown = null
	onerror: unknown = null
	close = vi.fn()
}

class MockMediaStream {
	getTracks = vi.fn().mockReturnValue([])
	addTrack = vi.fn()
}

describe("useWebRtcStream cleanup lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(console, "log").mockImplementation(() => {})
		vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection)
		vi.stubGlobal("EventSource", MockEventSource)
		vi.stubGlobal("MediaStream", MockMediaStream)
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					sessionId: "mock-session",
					offer: { type: "offer", sdp: "mock-sdp" },
				}),
			}),
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("calls unregisterDataChannels when the hook unmounts", () => {
		const { unmount } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		unmount()

		expect(mockUnregisterDataChannels).toHaveBeenCalled()
	})

	it("calls unregisterDataChannels when reconnect() is invoked", () => {
		const { result } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		act(() => {
			result.current.reconnect()
		})

		expect(mockUnregisterDataChannels).toHaveBeenCalled()
	})
})
