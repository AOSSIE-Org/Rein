// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	ConnectionProvider,
	useConnection,
} from "@/contexts/ConnectionProvider"

// Stub fetch so the latency-reporting side-effect inside handleMessage stays
// isolated: the provider fires fetch on the first pong when lastReportTimeRef
// is fresh (> 10 s since epoch 0).
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response))

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

function createMockDataChannel(label: string): RTCDataChannel {
	const dc = {
		label,
		readyState: "connecting" as RTCDataChannelState,
		onopen: null as ((this: RTCDataChannel, ev: Event) => unknown) | null,
		onclose: null as ((this: RTCDataChannel, ev: Event) => unknown) | null,
		onerror: null as ((this: RTCDataChannel, ev: Event) => unknown) | null,
		onmessage: null as
			| ((this: RTCDataChannel, ev: MessageEvent) => unknown)
			| null,
		send: vi.fn(),
		close: vi.fn(),
	}
	return dc as unknown as RTCDataChannel
}

describe("ConnectionProvider DataChannel lifecycle", () => {
	it("transitions status to connecting and then connected when channels open", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<ConnectionProvider>{children}</ConnectionProvider>
		)
		const { result } = renderHook(() => useConnection(), { wrapper })

		const unordered = createMockDataChannel("unordered")
		const ordered = createMockDataChannel("ordered")

		act(() => {
			result.current.registerDataChannel(unordered, ordered)
		})
		expect(result.current.status).toBe("connecting")

		act(() => {
			;(unordered as { readyState: string }).readyState = "open"
			;(ordered as { readyState: string }).readyState = "open"
			unordered.onopen?.call(unordered, new Event("open"))
			ordered.onopen?.call(ordered, new Event("open"))
		})
		expect(result.current.status).toBe("connected")
	})

	it("detaches listeners from superseded channels when registering a new pair", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<ConnectionProvider>{children}</ConnectionProvider>
		)
		const { result } = renderHook(() => useConnection(), { wrapper })

		const pair1Unordered = createMockDataChannel("p1-u")
		const pair1Ordered = createMockDataChannel("p1-o")

		act(() => {
			result.current.registerDataChannel(pair1Unordered, pair1Ordered)
		})

		expect(pair1Unordered.onopen).toBeTypeOf("function")
		expect(pair1Unordered.onclose).toBeTypeOf("function")
		expect(pair1Unordered.onerror).toBeTypeOf("function")
		expect(pair1Unordered.onmessage).toBeTypeOf("function")
		expect(pair1Ordered.onopen).toBeTypeOf("function")
		expect(pair1Ordered.onclose).toBeTypeOf("function")

		const pair2Unordered = createMockDataChannel("p2-u")
		const pair2Ordered = createMockDataChannel("p2-o")

		act(() => {
			result.current.registerDataChannel(pair2Unordered, pair2Ordered)
		})

		// First pair must have all handlers detached
		expect(pair1Unordered.onopen).toBeNull()
		expect(pair1Unordered.onclose).toBeNull()
		expect(pair1Unordered.onerror).toBeNull()
		expect(pair1Unordered.onmessage).toBeNull()
		expect(pair1Ordered.onopen).toBeNull()
		expect(pair1Ordered.onclose).toBeNull()
		expect(pair1Ordered.onerror).toBeNull()
		expect(pair1Ordered.onmessage).toBeNull()

		// Second pair has active handlers
		expect(pair2Unordered.onopen).toBeTypeOf("function")
		expect(pair2Ordered.onopen).toBeTypeOf("function")
	})

	it("ignores stale event callbacks from superseded channels and does not corrupt active status", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<ConnectionProvider>{children}</ConnectionProvider>
		)
		const { result } = renderHook(() => useConnection(), { wrapper })

		const pair1Unordered = createMockDataChannel("p1-u")
		const pair1Ordered = createMockDataChannel("p1-o")

		act(() => {
			result.current.registerDataChannel(pair1Unordered, pair1Ordered)
		})

		// Capture the stale handlers before they get detached by the second registerDataChannel
		const staleOnClose = pair1Unordered.onclose
		const staleOnMessage = pair1Unordered.onmessage

		const pair2Unordered = createMockDataChannel("p2-u")
		const pair2Ordered = createMockDataChannel("p2-o")

		act(() => {
			result.current.registerDataChannel(pair2Unordered, pair2Ordered)
		})

		// Bring the active (pair2) channels to connected state
		act(() => {
			;(pair2Unordered as { readyState: string }).readyState = "open"
			;(pair2Ordered as { readyState: string }).readyState = "open"
			pair2Unordered.onopen?.call(pair2Unordered, new Event("open"))
			pair2Ordered.onopen?.call(pair2Ordered, new Event("open"))
		})
		expect(result.current.status).toBe("connected")

		// Deliver a valid pong on the ACTIVE channel to establish a measured latency
		const activePongTimestamp = Date.now() - 30
		act(() => {
			pair2Unordered.onmessage?.call(
				pair2Unordered,
				new MessageEvent("message", {
					data: JSON.stringify({
						type: "pong",
						timestamp: activePongTimestamp,
					}),
				}),
			)
		})
		const measuredLatency = result.current.latency
		expect(measuredLatency).toBeGreaterThanOrEqual(0)

		// Simulate stale closure from the superseded channel — status must stay connected
		act(() => {
			;(pair1Unordered as { readyState: string }).readyState = "closed"
			staleOnClose?.call(pair1Unordered, new Event("close"))
		})
		expect(result.current.status).toBe("connected")

		// Simulate stale pong from the superseded channel — latency must not change
		act(() => {
			staleOnMessage?.call(
				pair1Unordered,
				new MessageEvent("message", {
					data: JSON.stringify({ type: "pong", timestamp: Date.now() - 500 }),
				}),
			)
		})
		// Status stays connected and latency preserves the value set by the active channel
		expect(result.current.status).toBe("connected")
		expect(result.current.latency).toBe(measuredLatency)
	})

	it("unregisterDataChannels detaches active listeners and resets state to disconnected", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<ConnectionProvider>{children}</ConnectionProvider>
		)
		const { result } = renderHook(() => useConnection(), { wrapper })

		const unordered = createMockDataChannel("u")
		const ordered = createMockDataChannel("o")

		act(() => {
			result.current.registerDataChannel(unordered, ordered)
			;(unordered as { readyState: string }).readyState = "open"
			;(ordered as { readyState: string }).readyState = "open"
			unordered.onopen?.call(unordered, new Event("open"))
			ordered.onopen?.call(ordered, new Event("open"))
		})
		expect(result.current.status).toBe("connected")

		act(() => {
			result.current.unregisterDataChannels()
		})

		expect(result.current.status).toBe("disconnected")
		expect(result.current.latency).toBeNull()
		expect(unordered.onopen).toBeNull()
		expect(unordered.onclose).toBeNull()
		expect(ordered.onopen).toBeNull()
		expect(ordered.onclose).toBeNull()
	})

	it("cleans up active channel listeners on provider unmount", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<ConnectionProvider>{children}</ConnectionProvider>
		)
		const { result, unmount } = renderHook(() => useConnection(), { wrapper })

		const unordered = createMockDataChannel("u")
		const ordered = createMockDataChannel("o")

		act(() => {
			result.current.registerDataChannel(unordered, ordered)
		})

		expect(unordered.onopen).toBeTypeOf("function")
		expect(ordered.onopen).toBeTypeOf("function")

		unmount()

		expect(unordered.onopen).toBeNull()
		expect(unordered.onclose).toBeNull()
		expect(ordered.onopen).toBeNull()
		expect(ordered.onclose).toBeNull()
	})
})
