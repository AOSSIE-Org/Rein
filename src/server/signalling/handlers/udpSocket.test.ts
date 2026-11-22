import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type RtpClientSession, UdpSocketManager } from "./udpSocket.ts"

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

vi.mock("../../../utils/logger.ts", () => ({
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

	it("forwards video and audio RTP only to connected peers", async () => {
		const connected = makeSession("connected", "connected")
		const completedIce = makeSession("connected", "completed")
		const preDtlsConnecting = makeSession("connecting", "connected")
		const fresh = makeSession("new", "new")
		const disconnected = makeSession("disconnected", "disconnected")
		const failed = makeSession("failed", "failed")
		const closed = makeSession("closed", "closed")

		const clients = new Map<string, RtpClientSession>([
			["connected-1", connected],
			["completed-1", completedIce],
			["connecting-1", preDtlsConnecting],
			["new-1", fresh],
			["disconnected-1", disconnected],
			["failed-1", failed],
			["closed-1", closed],
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

		for (const inactive of [
			preDtlsConnecting,
			fresh,
			disconnected,
			failed,
			closed,
		]) {
			expect(inactive.videoTrack.writeRtp).not.toHaveBeenCalled()
			expect(inactive.audioTrack.writeRtp).not.toHaveBeenCalled()
			expect(inactive.bytesSent).toBe(0)
		}
	})

	it("resumes forwarding when ICE recovers from disconnected while connectionState remains disconnected", async () => {
		const client = makeSession("connected", "connected")
		const clients = new Map<string, RtpClientSession>([["session-1", client]])

		manager = new UdpSocketManager(clients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket, audioSocket] = sockets
		const packet = Buffer.from([0x80, 0x60, 0x00, 0x03])

		// Simulate ICE drop (werift sets both iceConnectionState and connectionState)
		client.pc.iceConnectionState = "disconnected"
		client.pc.connectionState = "disconnected"

		videoSocket.emit("message", packet)
		audioSocket.emit("message", packet)
		expect(client.videoTrack.writeRtp).not.toHaveBeenCalled()
		expect(client.audioTrack.writeRtp).not.toHaveBeenCalled()
		expect(client.bytesSent).toBe(0)

		// Simulate ICE recovery (werift updates iceConnectionState without restoring connectionState)
		client.pc.iceConnectionState = "connected"

		videoSocket.emit("message", packet)
		audioSocket.emit("message", packet)
		expect(client.videoTrack.writeRtp).toHaveBeenCalledTimes(1)
		expect(client.videoTrack.writeRtp).toHaveBeenCalledWith(packet)
		expect(client.audioTrack.writeRtp).toHaveBeenCalledTimes(1)
		expect(client.audioTrack.writeRtp).toHaveBeenCalledWith(packet)
		expect(client.bytesSent).toBe(packet.length * 2)
	})
})
