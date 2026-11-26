// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWebRtcStream } from "@/hooks/useWebRtcStream"

const mockRegisterDataChannel = vi.fn()
const mockUnregisterDataChannels = vi.fn()
const mockSend = vi.fn()

vi.mock("@/contexts/ConnectionProvider", () => ({
	useConnection: () => ({
		status: "connected",
		latency: null,
		send: mockSend,
		registerDataChannel: mockRegisterDataChannel,
		unregisterDataChannels: mockUnregisterDataChannels,
	}),
}))

vi.mock("@/utils/i18n", () => ({
	t: (_cat: string, key: string) => key,
}))

interface MockDataChannel {
	label: string
}

let lastCreatedPc: MockRTCPeerConnection | null = null

class MockRTCPeerConnection {
	ontrack: unknown = null
	ondatachannel: ((event: { channel: MockDataChannel }) => void) | null = null
	onicecandidate: unknown = null
	onconnectionstatechange: unknown = null
	close = vi.fn()
	setRemoteDescription = vi.fn().mockResolvedValue(undefined)
	createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "" })
	setLocalDescription = vi.fn().mockResolvedValue(undefined)
	addIceCandidate = vi.fn().mockResolvedValue(undefined)
	getStats = vi.fn().mockResolvedValue(new Map())

	constructor() {
		lastCreatedPc = this
	}
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
		lastCreatedPc = null
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
		cleanup()
		vi.unstubAllGlobals()
	})

	it("calls unregisterDataChannels when the hook unmounts immediately (cancellation)", () => {
		const { unmount } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		unmount()

		expect(mockUnregisterDataChannels).toHaveBeenCalled()
	})

	it("calls unregisterDataChannels when reconnect() is invoked before connection is established", () => {
		const { result } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		act(() => {
			result.current.reconnect()
		})

		expect(mockUnregisterDataChannels).toHaveBeenCalled()
	})

	it("calls unregisterDataChannels on unmount after data channels are established", async () => {
		const { unmount } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(lastCreatedPc).not.toBeNull()

		const unorderedChannel = { label: "input-unordered" }
		const orderedChannel = { label: "input-ordered" }

		await act(async () => {
			lastCreatedPc?.ondatachannel?.({ channel: unorderedChannel })
			lastCreatedPc?.ondatachannel?.({ channel: orderedChannel })
		})

		expect(mockRegisterDataChannel).toHaveBeenCalledWith(
			unorderedChannel,
			orderedChannel,
		)
		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		unmount()

		expect(mockUnregisterDataChannels).toHaveBeenCalledTimes(1)
	})

	it("calls unregisterDataChannels on reconnect() after data channels are established", async () => {
		const { result } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(lastCreatedPc).not.toBeNull()

		const unorderedChannel = { label: "input-unordered" }
		const orderedChannel = { label: "input-ordered" }

		await act(async () => {
			lastCreatedPc?.ondatachannel?.({ channel: unorderedChannel })
			lastCreatedPc?.ondatachannel?.({ channel: orderedChannel })
		})

		expect(mockRegisterDataChannel).toHaveBeenCalledWith(
			unorderedChannel,
			orderedChannel,
		)
		expect(mockUnregisterDataChannels).not.toHaveBeenCalled()

		act(() => {
			result.current.reconnect()
		})

		expect(mockUnregisterDataChannels).toHaveBeenCalled()
	})

	it("sets playoutDelayHint and jitterBufferTarget to 0 on incoming track receivers", async () => {
		renderHook(() => useWebRtcStream({ token: "test-token" }))

		expect(lastCreatedPc).not.toBeNull()

		const mockReceiver = {
			playoutDelayHint: 1,
			jitterBufferTarget: 100,
		}
		const mockTrack = { id: "video-1", kind: "video" }
		const mockStream = new MockMediaStream()

		await act(async () => {
			const ontrack = lastCreatedPc?.ontrack as (ev: unknown) => void
			ontrack?.({
				track: mockTrack,
				receiver: mockReceiver,
				streams: [mockStream],
			})
		})

		expect(mockReceiver.playoutDelayHint).toBe(0)
		expect(mockReceiver.jitterBufferTarget).toBe(0)
	})

	it("retains the same MediaStream instance when subsequent tracks are added", async () => {
		const { result } = renderHook(() =>
			useWebRtcStream({ token: "test-token" }),
		)

		expect(lastCreatedPc).not.toBeNull()

		const videoTrack = { id: "video-1", kind: "video" }
		const audioTrack = { id: "audio-1", kind: "audio" }
		const initialStream = new MockMediaStream()

		await act(async () => {
			const ontrack = lastCreatedPc?.ontrack as (ev: unknown) => void
			ontrack?.({
				track: videoTrack,
				streams: [initialStream],
			})
		})

		const streamAfterVideo = result.current.videoStream
		expect(streamAfterVideo).toBe(initialStream)

		await act(async () => {
			const ontrack = lastCreatedPc?.ontrack as (ev: unknown) => void
			ontrack?.({
				track: audioTrack,
				streams: [initialStream],
			})
		})

		// Reference should not change to a new MediaStream instance
		expect(result.current.videoStream).toBe(streamAfterVideo)
		expect(initialStream.addTrack).toHaveBeenCalledWith(audioTrack)
	})
})
