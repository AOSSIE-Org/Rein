import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientSession } from "./sessionStore.ts"
import { UdpSocketManager } from "./udpSocket.ts"

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
	sessionId: string,
	connectionState: ClientSession["pc"]["connectionState"],
): ClientSession {
	return {
		pc: {
			connectionState,
		} as unknown as ClientSession["pc"],
		videoTrack: {
			writeRtp: vi.fn(),
		} as unknown as ClientSession["videoTrack"],
		audioTrack: {
			writeRtp: vi.fn(),
		} as unknown as ClientSession["audioTrack"],
		inputHandler: {
			destroy: vi.fn(),
		} as unknown as ClientSession["inputHandler"],
		sessionId,
		bytesRecv: 0,
		bytesSent: 0,
		dcUnordered: { readyState: "open" } as ClientSession["dcUnordered"],
		dcOrdered: { readyState: "open" } as ClientSession["dcOrdered"],
		sessionSseRes: null,
		pendingEvents: [],
		disconnectTimer: null,
		createdAt: 1_000,
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

	it("forwards video and audio RTP only to clients with connected PeerConnections", async () => {
		const connected = makeSession("connected-1", "connected")
		const connecting = makeSession("connecting-1", "connecting")
		const fresh = makeSession("new-1", "new")
		const disconnected = makeSession("disconnected-1", "disconnected")
		const failed = makeSession("failed-1", "failed")
		const closed = makeSession("closed-1", "closed")

		const clients = new Map<string, ClientSession>([
			[connected.sessionId, connected],
			[connecting.sessionId, connecting],
			[fresh.sessionId, fresh],
			[disconnected.sessionId, disconnected],
			[failed.sessionId, failed],
			[closed.sessionId, closed],
		])

		manager = new UdpSocketManager(clients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket, audioSocket] = sockets
		const videoPacket = Buffer.from([0x80, 0x60, 0x00, 0x01])
		const audioPacket = Buffer.from([0x80, 0xef, 0x00, 0x02, 0xaa])

		videoSocket.emit("message", videoPacket)
		audioSocket.emit("message", audioPacket)

		expect(connected.videoTrack.writeRtp).toHaveBeenCalledTimes(1)
		expect(connected.videoTrack.writeRtp).toHaveBeenCalledWith(videoPacket)
		expect(connected.audioTrack.writeRtp).toHaveBeenCalledTimes(1)
		expect(connected.audioTrack.writeRtp).toHaveBeenCalledWith(audioPacket)
		expect(connected.bytesSent).toBe(videoPacket.length + audioPacket.length)

		for (const nonConnected of [
			connecting,
			fresh,
			disconnected,
			failed,
			closed,
		]) {
			expect(nonConnected.videoTrack.writeRtp).not.toHaveBeenCalled()
			expect(nonConnected.audioTrack.writeRtp).not.toHaveBeenCalled()
			expect(nonConnected.bytesSent).toBe(0)
		}
	})

	it("resumes forwarding if a transiently disconnected client reconnects", async () => {
		const client = makeSession("session-1", "disconnected")
		const clients = new Map<string, ClientSession>([[client.sessionId, client]])

		manager = new UdpSocketManager(clients)
		await vi.waitFor(() => expect(sockets).toHaveLength(2))

		const [videoSocket] = sockets
		const packet = Buffer.from([0x80, 0x60, 0x00, 0x03])

		videoSocket.emit("message", packet)
		expect(client.videoTrack.writeRtp).not.toHaveBeenCalled()
		expect(client.bytesSent).toBe(0)

		Object.assign(client.pc, { connectionState: "connected" })
		videoSocket.emit("message", packet)

		expect(client.videoTrack.writeRtp).toHaveBeenCalledTimes(1)
		expect(client.videoTrack.writeRtp).toHaveBeenCalledWith(packet)
		expect(client.bytesSent).toBe(packet.length)
	})
})
