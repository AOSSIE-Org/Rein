/**
 * Cross-platform input event dispatcher and coordinator.
 *
 * Routes validated input messages to the appropriate platform-specific
 * injector, manages runtime configuration, applies input processing,
 * throttles high-frequency events, and provides a unified interface for
 * mouse, keyboard, touch, clipboard, and gesture interactions.
 */
import os from "node:os"
import { createInputInjector, applyMotion } from "@aossie/rein-input"
import {
	DEFAULT_SCREEN_HEIGHT,
	DEFAULT_SCREEN_WIDTH,
	MAX_TEXT_LENGTH,
	MAX_COMBO_KEYS,
	MAX_COORD,
	MAX_KEY_LENGTH,
} from "./constants.ts"
import type { InputConfig, InputMessage, PlatformInjector } from "./types.ts"

const VALID_BUTTONS = ["left", "right", "middle"] as const
type MouseButton = (typeof VALID_BUTTONS)[number]

export class InputHandler {
	private injector: PlatformInjector
	private platform: "win32" | "linux" | "darwin" | "other"
	private lastMoveTime = 0
	private lastScrollTime = 0
	private pendingMove: InputMessage | null = null
	private pendingScroll: InputMessage | null = null
	private moveTimer: ReturnType<typeof setTimeout> | null = null
	private scrollTimer: ReturnType<typeof setTimeout> | null = null
	private throttleMs: number
	private onError?: (errorType: string, message: string) => void

	private config: InputConfig = {
		sensitivity: 1.0,
		invertScroll: false,
		acceleration: true,
		screenWidth: DEFAULT_SCREEN_WIDTH,
		screenHeight: DEFAULT_SCREEN_HEIGHT,
	}

	constructor(
		config: Partial<InputConfig> = {},
		throttleMs = 8,
		onError?: (errorType: string, message: string) => void,
	) {
		this.throttleMs = throttleMs
		this.config = { ...this.config, ...config }
		this.onError = onError

		const plat = os.platform()
		this.platform =
			plat === "win32" || plat === "linux" || plat === "darwin" ? plat : "other"
		this.injector = createInputInjector({
			config: this.config,
			platform: this.platform,
			onError: this.onError,
		})
	}

	updateConfig(config: Partial<InputConfig>): void {
		console.log("[InputHandler] Updating config:", config)
		this.config = { ...this.config, ...config }
		this.injector.updateConfig(config)
	}

	setThrottleMs(ms: number): void {
		this.throttleMs = ms
	}

	async handleMessage(msg: InputMessage): Promise<void> {
		this.sanitizeMessage(msg)

		if (msg.type === "move" || msg.type === "scroll") {
			if (this.throttle(msg)) return
		}

		try {
			this.dispatch(msg)
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err)
			console.error(`[InputHandler] Error handling ${msg.type} event:`, errMsg)
			// Safety: release mouse button if a click-down throws
			if (msg.type === "click" && msg.press && isValidButton(msg.button)) {
				try {
					this.injector.injectMouseButton(msg.button, false)
				} catch (cleanupErr) {
					console.error(
						"[InputHandler] Cleanup after click failure:",
						cleanupErr,
					)
				}
			}
		}
	}

	destroy(): void {
		this.injector.destroy()
		clearTimeout(this.moveTimer ?? undefined)
		clearTimeout(this.scrollTimer ?? undefined)
		this.moveTimer = null
		this.scrollTimer = null
		console.log("[InputHandler] Destroyed")
	}

	private sanitizeMessage(msg: InputMessage): void {
		if (typeof msg.text === "string" && msg.text.length > MAX_TEXT_LENGTH) {
			msg.text = msg.text.substring(0, MAX_TEXT_LENGTH)
		}
		msg.dx = clampFinite(msg.dx, -MAX_COORD, MAX_COORD)
		msg.dy = clampFinite(msg.dy, -MAX_COORD, MAX_COORD)
		msg.delta = clampFinite(msg.delta, -MAX_COORD, MAX_COORD)
	}

	private throttle(msg: InputMessage): boolean {
		const now = Date.now()
		const isMove = msg.type === "move"
		const lastKey = isMove ? "lastMoveTime" : "lastScrollTime"
		const pendingKey = isMove ? "pendingMove" : "pendingScroll"
		const timerKey = isMove ? "moveTimer" : "scrollTimer"

		if (now - this[lastKey] < this.throttleMs) {
			this[pendingKey] = msg
			if (!this[timerKey]) {
				this[timerKey] = setTimeout(() => {
					this[timerKey] = null
					const pending = this[pendingKey]
					if (pending) {
						this[pendingKey] = null
						this.handleMessage(pending).catch((err) =>
							console.error(
								`[InputHandler] Error flushing pending ${msg.type}:`,
								err,
							),
						)
					}
				}, this.throttleMs)
			}
			return true
		}

		this[lastKey] = now
		return false
	}

	private dispatch(msg: InputMessage): void {
		switch (msg.type) {
			case "move": {
				if (msg.dx === 0 && msg.dy === 0) break
				const { ax, ay } = applyMotion(msg.dx ?? 0, msg.dy ?? 0, this.config)
				this.injector.injectMouseMove(ax, ay)
				break
			}

			case "click": {
				if (!isValidButton(msg.button)) break
				this.injector.injectMouseButton(msg.button, !!msg.press)
				break
			}

			case "scroll": {
				this.injector.injectMouseWheel(msg.dx ?? 0, msg.dy ?? 0)
				break
			}

			case "zoom": {
				if (!Number.isFinite(msg.delta) || msg.delta === 0) break
				const MAX_ZOOM_STEP = 5
				const delta = msg.delta ?? 0
				const scaled =
					Math.sign(delta) * Math.min(Math.abs(delta) * 0.5, MAX_ZOOM_STEP)
				const amount = Math.round(-scaled)
				if (amount !== 0) {
					this.injector.injectKey("control", "HOLD")
					this.injector.injectMouseWheel(0, amount)
					this.injector.injectKey("control", "RELEASE")
				}
				break
			}

			case "copy": {
				this.injector.injectCombo(
					this.platform === "darwin" ? ["meta", "c"] : ["control", "c"],
				)
				break
			}

			case "paste": {
				this.injector.injectCombo(
					this.platform === "darwin" ? ["meta", "v"] : ["control", "v"],
				)
				break
			}

			case "key": {
				if (
					!msg.key ||
					typeof msg.key !== "string" ||
					msg.key.length > MAX_KEY_LENGTH
				)
					break
				const key =
					msg.key === " " || msg.key.toLowerCase() === "space"
						? "space"
						: msg.key
				this.injector.injectKey(key)
				break
			}

			case "combo": {
				if (
					!Array.isArray(msg.keys) ||
					msg.keys.length === 0 ||
					msg.keys.length > MAX_COMBO_KEYS
				)
					break
				const validKeys = msg.keys.filter(
					(k): k is string =>
						typeof k === "string" && k.length > 0 && k.length <= MAX_KEY_LENGTH,
				)
				if (validKeys.length === 0) {
					console.error("[InputHandler] No valid keys in combo")
					break
				}
				this.injector.injectCombo(validKeys)
				console.log(`[InputHandler] Combo executed: ${validKeys.join("+")}`)
				break
			}

			case "text": {
				if (
					!msg.text ||
					typeof msg.text !== "string" ||
					msg.text.length > MAX_TEXT_LENGTH
				)
					break
				this.injector.injectText(msg.text)
				break
			}

			case "touch": {
				if (!msg.contacts?.length) break
				const valid = msg.contacts.filter(
					(c) =>
						typeof c.id === "number" &&
						typeof c.x === "number" &&
						typeof c.y === "number" &&
						["down", "move", "up"].includes(c.state),
				)
				if (valid.length > 0) this.injector.injectTouch(valid)
				break
			}

			default:
				console.warn(
					`[InputHandler] Unknown message type: ${(msg as { type?: unknown }).type}`,
				)
		}
	}
}

function clampFinite(value: unknown, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0
	return Math.max(min, Math.min(max, value))
}

function isValidButton(button: unknown): button is MouseButton {
	return (
		typeof button === "string" &&
		(VALID_BUTTONS as readonly string[]).includes(button)
	)
}
