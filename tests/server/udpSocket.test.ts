import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	type RtpClientSession,
	UdpSocketManager,
	isClientReadyForMedia,
} from "../../src/server/signalling/handlers/udpSocket.ts"

const sockets = vi.hoisted(() => [] as FakeUdpSocket[])

class FakeUdpSocket extends EventEmitter {
	bind = vi.fn((_port: number, _host: string, callback?: () => void): this => {
		callback?.()
		return this
	})
	unref = vi.fn((): this => this)
	setRecvBufferSize = vi.fn()
	close = vi.fn((callback?: () => void): this => {
		callback?.()
		return this
	})
}

vi.mock("node:dgram", () => {
	const createSocket = vi.fn(() => {
		const socket = new FakeUdpSocket()
		sockets.push(socket)
		return socket
	})
	return {
		default: { createSocket },
		createSocket,
	}
})

vi.mock("../../src/utils/logger.ts", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

function makeSession(
	connectionState: RtpClientSession["pc"]["connectionState"],
	iceConnectionState: RtpClientSession["pc"]["iceConnectionState"],
): RtpClientSession {
	return {
		pc: {
			connectionState,
			iceConnectionState,
		},
		videoTrack: {
			writeRtp: vi.fn(),
		},
		audioTrack: {
			writeRtp: vi.fn(),
		},
		bytesSent: 0,
	}
}

describe("isClientReadyForMedia helper", () => {
	it("accepts fully connected clients", () => {
		expect(
			isClientReadyForMedia(makeSession("connected", "connected")),
		).toBe(true)
		expect(
			isClientReadyForMedia(makeSession("connected", "completed")),
		).toBe(true)
	})

	it("rejects clients still in initial handshake", () => {
		expect(isClientReadyForMedia(makeSession("new", "new"))).toBe(false)
		expect(
			isClientReadyForMedia(makeSession("connecting", "connected")),
		).toBe(false)
	})

	it("rejects failed or closed sessions", () => {
		expect(isClientReadyForMedia(makeSession("failed", "failed"))).toBe(false)
		expect(isClientReadyForMedia(makeSession("closed", "closed"))).toBe(false)
	})

	it("handles Werift ICE recovery semantics", () => {
		// When Werift re-establishes ICE after a drop, iceConnectionState recovers to connected
		// while connectionState remains disconnected.
		expect(
			isClientReadyForMedia(makeSession("disconnected", "connected")),
		).toBe(true)
		expect(
			isClientReadyForMedia(makeSession("disconnected", "completed")),
		).toBe(true)
		expect(
			isClientReadyForMedia(makeSession("disconnected", "disconnected")),
		).toBe(false)
	})
})

describe("UdpSocketManager RTP forwarding", () => {
	let manager: UdpSocketManager | null = null

	beforeEach(() => {
		sockets.length = 0
	})

	afterEach(async () => {
		if (manager) {
			await manager.shutdown()
			manager = null
		}
		vi.clearAllMocks()
	})

	it("bails out early without processing when clients map is empty", async () => {
		const emptyClients = new Map<string, RtpClientSession>()
		manager = new UdpSocketManager(emptyClients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket] = sockets
		const packet = Buffer.from([0x80, 0x60, 0x00, 0x01])

		// Should not throw or perform iterations
		expect(() => videoSocket.emit("message", packet)).not.toThrow()
	})

	it("forwards video and audio RTP only to ready peers and updates bytesSent", async () => {
		const connected = makeSession("connected", "connected")
		const completedIce = makeSession("connected", "completed")
		const preDtlsConnecting = makeSession("connecting", "connected")
		const fresh = makeSession("new", "new")
		const disconnected = makeSession("disconnected", "disconnected")
		const failed = makeSession("failed", "failed")

		const clients = new Map<string, RtpClientSession>([
			["connected-1", connected],
			["completed-1", completedIce],
			["connecting-1", preDtlsConnecting],
			["new-1", fresh],
			["disconnected-1", disconnected],
			["failed-1", failed],
		])

		manager = new UdpSocketManager(clients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket, audioSocket] = sockets
		const videoPacket = Buffer.from([0x80, 0x60, 0x00, 0x01])
		const audioPacket = Buffer.from([0x80, 0xef, 0x00, 0x02, 0xaa])

		videoSocket.emit("message", videoPacket)
		audioSocket.emit("message", audioPacket)

		for (const active of [connected, completedIce]) {
			expect(active.videoTrack.writeRtp).toHaveBeenCalledTimes(1)
			expect(active.videoTrack.writeRtp).toHaveBeenCalledWith(videoPacket)
			expect(active.audioTrack.writeRtp).toHaveBeenCalledTimes(1)
			expect(active.audioTrack.writeRtp).toHaveBeenCalledWith(audioPacket)
			expect(active.bytesSent).toBe(videoPacket.length + audioPacket.length)
		}

		for (const inactive of [preDtlsConnecting, fresh, disconnected, failed]) {
			expect(inactive.videoTrack.writeRtp).not.toHaveBeenCalled()
			expect(inactive.audioTrack.writeRtp).not.toHaveBeenCalled()
			expect(inactive.bytesSent).toBe(0)
		}
	})

	it("handles individual track write errors gracefully without crashing", async () => {
		const throwingClient = makeSession("connected", "connected")
		const healthyClient = makeSession("connected", "connected")

		throwingClient.videoTrack.writeRtp = vi.fn(() => {
			throw new Error("Track write failed")
		})

		const clients = new Map<string, RtpClientSession>([
			["throwing-1", throwingClient],
			["healthy-1", healthyClient],
		])

		manager = new UdpSocketManager(clients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket] = sockets
		const packet = Buffer.from([0x80, 0x60, 0x00, 0x01])

		expect(() => videoSocket.emit("message", packet)).not.toThrow()
		expect(healthyClient.videoTrack.writeRtp).toHaveBeenCalledWith(packet)
		expect(healthyClient.bytesSent).toBe(packet.length)
		expect(throwingClient.bytesSent).toBe(0)
	})
})
