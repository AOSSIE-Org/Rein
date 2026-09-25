import dgram from "node:dgram"
import logger from "../../../utils/logger.ts"
import { RTP_HOST, RTP_PORT, RTP_PORT_AUDIO } from "../../constants.ts"
import type { ClientSession } from "./sessionStore.ts"

// ---------------------------------------------------------------------------
// UdpSocketManager — owns the UDP sockets that receive RTP from GStreamer
// ---------------------------------------------------------------------------

export class UdpSocketManager {
	private videoSocket: dgram.Socket | null = null
	private audioSocket: dgram.Socket | null = null
	private isBound = false
	private hasError = false
	private isShutdown = false
	private rebindTimer: NodeJS.Timeout | null = null
	private rebindBackoffMs = 500
	private readonly maxBackoffMs = 10_000

	constructor(private readonly clients: Map<string, ClientSession>) {
		this.setup()
	}

	public healthy(): boolean {
		return !this.hasError && this.isBound
	}

	public async shutdown(): Promise<void> {
		this.isShutdown = true
		if (this.rebindTimer) {
			clearTimeout(this.rebindTimer)
			this.rebindTimer = null
		}
		await this.closeSockets()
	}

	public async recreateSockets(): Promise<void> {
		this.isShutdown = false
		await this.setup()
	}

	// -------------------------------------------------------------------------
	// Private
	// -------------------------------------------------------------------------

	private async setup(): Promise<void> {
		if (this.isShutdown) return

		if (this.rebindTimer) {
			clearTimeout(this.rebindTimer)
			this.rebindTimer = null
		}

		await this.closeSockets()
		if (this.isShutdown) return

		try {
			this.videoSocket = this.createRtpSocket(RTP_PORT, "video")
			this.audioSocket = this.createRtpSocket(RTP_PORT_AUDIO, "audio")

			this.isBound = true
			this.hasError = false
			this.rebindBackoffMs = 500
		} catch (err) {
			logger.error(`Failed to create/bind UDP sockets: ${String(err)}`)
			this.onFailure()
		}
	}

	private static readonly RCVBUF_VIDEO = 4 * 1024 * 1024
	private static readonly RCVBUF_AUDIO = 512 * 1024

	private createRtpSocket(
		port: number,
		trackKind: "video" | "audio",
	): dgram.Socket {
		const socket = dgram.createSocket({ type: "udp4", reuseAddr: true })
		socket.once("listening", () => {
			const bufSize =
				trackKind === "video"
					? UdpSocketManager.RCVBUF_VIDEO
					: UdpSocketManager.RCVBUF_AUDIO
			try {
				socket.setRecvBufferSize(bufSize)
			} catch (e) {
				logger.warn(
					`Could not set UDP recv buffer to ${bufSize} for ${trackKind}: ${String(e)}`,
				)
			}
		})

		socket.on("error", (err) => {
			if (this.isShutdown) return
			logger.error(
				`UDP socket error on port ${port} (${trackKind}):\n${err.stack ?? err}`,
			)
			this.onFailure()
		})

		socket.on("message", (msg) => {
			for (const client of this.clients.values()) {
				try {
					if (trackKind === "video") {
						client.videoTrack.writeRtp(msg)
					} else {
						client.audioTrack.writeRtp(msg)
					}
					client.bytesSent += msg.length
				} catch {
					// Individual track write errors are non-fatal
				}
			}
		})

		socket.bind(port, RTP_HOST, () => {
			// unref so the socket does not prevent the process from exiting cleanly,
			// which ensures the OS port is released promptly on restart.
			socket.unref()
			logger.info(
				`UDP socket listening for ${trackKind} RTP packets on ${RTP_HOST}:${port}`,
			)
		})

		return socket
	}

	private onFailure(): void {
		if (this.isShutdown) return
		this.isBound = false
		this.hasError = true
		// Close sockets first; rebind timer fires after the close completes
		this.closeSockets()
			.then(() => {
				if (this.isShutdown || this.rebindTimer) return

				const delay = this.rebindBackoffMs
				logger.warn(`Scheduling UDP socket rebind in ${delay}ms`)
				this.rebindTimer = setTimeout(() => {
					this.rebindTimer = null
					if (!this.isShutdown) {
						this.setup()
					}
				}, delay)

				this.rebindBackoffMs = Math.min(
					this.rebindBackoffMs * 2,
					this.maxBackoffMs,
				)
			})
			.catch((err) => {
				logger.warn(
					`Error closing sockets during failure recovery: ${String(err)}`,
				)
			})
	}

	private closeSockets(): Promise<void> {
		const sockets = [this.videoSocket, this.audioSocket]
		this.videoSocket = null
		this.audioSocket = null
		const closes = sockets.map(
			(socket) =>
				new Promise<void>((resolve) => {
					if (!socket) return resolve()
					let done = false
					const finish = () => {
						if (!done) {
							done = true
							resolve()
						}
					}
					const timer = setTimeout(finish, 300)
					try {
						socket.removeAllListeners()
						socket.on("error", () => {})
						socket.close(() => {
							clearTimeout(timer)
							finish()
						})
					} catch {
						clearTimeout(timer)
						finish()
					}
				}),
		)
		return Promise.all(closes).then(() => {})
	}
}
