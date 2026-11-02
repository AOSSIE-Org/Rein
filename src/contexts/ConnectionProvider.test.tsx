// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { describe, expect, it, vi } from "vitest"
import { ConnectionProvider, useConnection } from "./ConnectionProvider"

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
			unordered.onopen?.(new Event("open"))
			ordered.onopen?.(new Event("open"))
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

		// Capture the stale onclose callback before it gets detached
		const staleOnClose = pair1Unordered.onclose
		const staleOnMessage = pair1Unordered.onmessage

		const pair2Unordered = createMockDataChannel("p2-u")
		const pair2Ordered = createMockDataChannel("p2-o")

		act(() => {
			result.current.registerDataChannel(pair2Unordered, pair2Ordered)
		})

		act(() => {
			;(pair2Unordered as { readyState: string }).readyState = "open"
			;(pair2Ordered as { readyState: string }).readyState = "open"
			pair2Unordered.onopen?.(new Event("open"))
			pair2Ordered.onopen?.(new Event("open"))
		})
		expect(result.current.status).toBe("connected")

		// Simulate stale closure execution from the old channel
		act(() => {
			;(pair1Unordered as { readyState: string }).readyState = "closed"
			staleOnClose?.(new Event("close"))
		})
		// Status must remain connected; stale channel closure must NOT reset status to disconnected
		expect(result.current.status).toBe("connected")

		// Simulate stale pong message from the old channel
		act(() => {
			staleOnMessage?.(
				new MessageEvent("message", {
					data: JSON.stringify({ type: "pong", timestamp: Date.now() - 50 }),
				}),
			)
		})
		expect(result.current.latency).toBeNull()
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
			unordered.onopen?.(new Event("open"))
			ordered.onopen?.(new Event("open"))
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
