import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import dgram from "node:dgram"
import { getLocalIp } from "../getLocalIp"

vi.mock("node:dgram")

describe("getLocalIp", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it("should return the local IP address on successful connection", async () => {
		const mockSocket = {
			connect: vi.fn(),
			on: vi.fn(),
			address: vi.fn(() => ({ address: "192.168.1.5" })),
			close: vi.fn(),
			removeAllListeners: vi.fn(),
		}

		;(dgram.createSocket as any).mockReturnValue(mockSocket)

		const promise = getLocalIp()

		// Simulate 'connect' event
		const connectHandler = mockSocket.on.mock.calls.find(
			(call: any) => call[0] === "connect",
		)?.[1]
		if (connectHandler) connectHandler()

		const ip = await promise
		expect(ip).toBe("192.168.1.5")
		expect(mockSocket.connect).toHaveBeenCalledWith(1, "1.1.1.1")
	})

	it("should return 127.0.0.1 on error", async () => {
		const mockSocket = {
			connect: vi.fn(),
			on: vi.fn(),
			address: vi.fn(),
			close: vi.fn(),
			removeAllListeners: vi.fn(),
		}

		;(dgram.createSocket as any).mockReturnValue(mockSocket)

		const promise = getLocalIp()

		// Simulate 'error' event
		const errorHandler = mockSocket.on.mock.calls.find(
			(call: any) => call[0] === "error",
		)?.[1]
		if (errorHandler) errorHandler()

		const ip = await promise
		expect(ip).toBe("127.0.0.1")
	})

	it("should return 127.0.0.1 on timeout", async () => {
		const mockSocket = {
			connect: vi.fn(),
			on: vi.fn(),
			address: vi.fn(),
			close: vi.fn(),
			removeAllListeners: vi.fn(),
		}

		;(dgram.createSocket as any).mockReturnValue(mockSocket)

		const promise = getLocalIp()

		// Fast-forward time
		vi.advanceTimersByTime(1001)

		const ip = await promise
		expect(ip).toBe("127.0.0.1")
	})

	it("should return 127.0.0.1 if address() returns unexpected format", async () => {
		const mockSocket = {
			connect: vi.fn(),
			on: vi.fn(),
			address: vi.fn(() => "string-address"), // Not an object
			close: vi.fn(),
			removeAllListeners: vi.fn(),
		}

		;(dgram.createSocket as any).mockReturnValue(mockSocket)

		const promise = getLocalIp()

		const connectHandler = mockSocket.on.mock.calls.find(
			(call: any) => call[0] === "connect",
		)?.[1]
		if (connectHandler) connectHandler()

		const ip = await promise
		expect(ip).toBe("127.0.0.1")
	})
})
