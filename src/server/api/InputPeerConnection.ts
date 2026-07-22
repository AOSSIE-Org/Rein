import nodeDataChannel, { type PeerConnection } from "node-datachannel"
import { InputHandler } from "../InputHandler"
import logger from "../../utils/logger"
import type { InputMessage, InputConfig } from "../types"

// Optimize SCTP settings globally for ultra-low latency.
// Disabling delayed SACK (setting it to 0ms) prevents acknowledgment delays.
// This keeps the browser client's transmission window fully open and avoids input lag bursts.
nodeDataChannel.setSctpSettings({
	delayedSackTime: 0,
})

const VALID_INPUT_TYPES = new Set([
	"move",
	"click",
	"scroll",
	"key",
	"text",
	"zoom",
	"combo",
	"copy",
	"paste",
	"touch",
])

export class InputPeerConnection {
	private pc: PeerConnection
	private inputHandler: InputHandler
	private sessionId: string
	private answerResolve: ((sdp: string) => void) | null = null

	constructor(
		sessionId: string,
		onLocalCandidate?: (candidate: string, mid: string) => void,
		initialConfig?: Partial<InputConfig>,
		onClosed?: () => void,
		onError?: (errorType: string, message: string) => void,
	) {
		this.sessionId = sessionId
		this.inputHandler = new InputHandler(
			initialConfig,
			8,
			onError ? (errorType, message) => onError(errorType, message) : undefined,
		)

		this.pc = new nodeDataChannel.PeerConnection(`input-${sessionId}`, {
			iceServers: [],
			enableIceTcp: false,
		})

		if (onLocalCandidate) {
			this.pc.onLocalCandidate((candidate, mid) => {
				onLocalCandidate(candidate, mid)
			})
		}

		this.pc.onDataChannel((dc) => {
			logger.info(
				`[Input] DataChannel "${dc.getLabel()}" open for session: ${sessionId}`,
			)

			dc.onMessage((msg) => {
				try {
					const raw = typeof msg === "string" ? msg : msg.toString()
					const parsed = JSON.parse(raw) as {
						type?: string
						timestamp?: number
					}

					if (parsed.type === "ping") {
						dc.sendMessage(
							JSON.stringify({ type: "pong", timestamp: parsed.timestamp }),
						)
						return
					}

					if (!parsed.type || !VALID_INPUT_TYPES.has(parsed.type)) {
						logger.warn(`[Input] Unknown type: ${parsed.type}`)
						return
					}

					this.inputHandler
						.handleMessage(parsed as InputMessage)
						.catch((err) =>
							logger.error(`[Input] Handler error: ${String(err)}`),
						)
				} catch (err) {
					logger.error(`[Input] Parse error: ${String(err)}`)
				}
			})

			dc.onClosed(() => {
				logger.info(`[Input] DataChannel closed: ${sessionId}`)
			})
		})

		this.pc.onLocalDescription((sdp, type) => {
			if (type === "answer" && this.answerResolve) {
				this.answerResolve(sdp)
				this.answerResolve = null
			}
		})

		let closedCalled = false
		this.pc.onStateChange((state) => {
			logger.info(`[Input] PC state [${sessionId}]: ${state}`)
			if (
				state === "closed" ||
				state === "disconnected" ||
				state === "failed"
			) {
				if (onClosed && !closedCalled) {
					closedCalled = true
					onClosed()
				}
			}
		})
	}

	processOffer(offerSdp: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Input PC answer generation timed out"))
			}, 10_000)

			this.answerResolve = (sdp) => {
				clearTimeout(timeout)
				resolve(sdp)
			}

			try {
				logger.info(offerSdp.split("\n").slice(0, 10).join("\n"))
				this.pc.setRemoteDescription(offerSdp, "offer")
			} catch (err) {
				clearTimeout(timeout)
				reject(err)
			}
		})
	}

	addRemoteCandidate(candidate: string, mid: string): void {
		try {
			this.pc.addRemoteCandidate(candidate, mid)
		} catch (err) {
			logger.warn(`[Input] Failed to add candidate: ${String(err)}`)
		}
	}

	updateConfig(config: Partial<InputConfig>): void {
		this.inputHandler.updateConfig(config)
	}

	async handleMessage(msg: InputMessage): Promise<void> {
		await this.inputHandler.handleMessage(msg)
	}

	close(): void {
		try {
			this.pc.close()
		} catch {}
		this.inputHandler.destroy()
		logger.info(`[Input] Connection closed: ${this.sessionId}`)
	}
}
