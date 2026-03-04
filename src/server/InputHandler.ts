import { Button, Key, Point, keyboard, mouse } from "@nut-tree-fork/nut-js"
import { KEY_MAP } from "./KeyMap"
import { moveRelative } from "./ydotool"
import os from "node:os"

export interface InputMessage {
	type:
		| "move"
		| "paste"
		| "copy"
		| "click"
		| "scroll"
		| "key"
		| "text"
		| "zoom"
		| "combo"
	dx?: number
	dy?: number
	button?: "left" | "right" | "middle"
	press?: boolean
	key?: string
	keys?: string[]
	text?: string
	delta?: number
}

export class InputHandler {
	private lastMoveTime = 0
	private lastScrollTime = 0
	private pendingMove: InputMessage | null = null
	private pendingScroll: InputMessage | null = null
	private moveTimer: ReturnType<typeof setTimeout> | null = null
	private scrollTimer: ReturnType<typeof setTimeout> | null = null
	private throttleMs: number
	private modifier: Key

	constructor(throttleMs = 8) {
		mouse.config.mouseSpeed = 1000
		this.modifier = os.platform() === "darwin" ? Key.LeftSuper : Key.LeftControl
		this.throttleMs = throttleMs
	}

	setThrottleMs(ms: number) {
		this.throttleMs = ms
	}

	private isFiniteNumber(value: unknown): value is number {
		return typeof value === "number" && Number.isFinite(value)
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value))
	}

	async handleMessage(msg: InputMessage) {
		if (msg.text && typeof msg.text === "string" && msg.text.length > 500) {
			msg.text = msg.text.substring(0, 500)
		}

		const MAX_COORD = 2000
		if (this.isFiniteNumber(msg.dx)) {
			msg.dx = this.clamp(msg.dx, -MAX_COORD, MAX_COORD)
		} else {
			msg.dx = 0
		}
		if (this.isFiniteNumber(msg.dy)) {
			msg.dy = this.clamp(msg.dy, -MAX_COORD, MAX_COORD)
		} else {
			msg.dy = 0
		}
		if (this.isFiniteNumber(msg.delta)) {
			msg.delta = this.clamp(msg.delta, -MAX_COORD, MAX_COORD)
		} else {
			msg.delta = 0
		}

		// Throttling: Limit high-frequency events (configurable via inputThrottleMs)
		if (msg.type === "move") {
			const now = Date.now()
			if (now - this.lastMoveTime < this.throttleMs) {
				this.pendingMove = msg
				if (!this.moveTimer) {
					this.moveTimer = setTimeout(() => {
						this.moveTimer = null
						if (this.pendingMove) {
							const pending = this.pendingMove
							this.pendingMove = null
							this.handleMessage(pending).catch((err) => {
								console.error("Error processing pending move event:", err)
							})
						}
					}, this.throttleMs)
				}
				return
			}
			this.lastMoveTime = now
		} else if (msg.type === "scroll") {
			const now = Date.now()
			if (now - this.lastScrollTime < this.throttleMs) {
				this.pendingScroll = msg
				if (!this.scrollTimer) {
					this.scrollTimer = setTimeout(() => {
						this.scrollTimer = null
						if (this.pendingScroll) {
							const pending = this.pendingScroll
							this.pendingScroll = null
							this.handleMessage(pending).catch((err) => {
								console.error("Error processing pending move event:", err)
							})
						}
					}, this.throttleMs)
				}
				return
			}
			this.lastScrollTime = now
		}

		switch (msg.type) {
			case "move":
				try {
					if (
						typeof msg.dx === "number" &&
						typeof msg.dy === "number" &&
						Number.isFinite(msg.dx) &&
						Number.isFinite(msg.dy)
					) {
						const success = await moveRelative(msg.dx, msg.dy)

						if (!success) {
							const currentPos = await mouse.getPosition()

							await mouse.setPosition(
								new Point(
									Math.round(currentPos.x + msg.dx),
									Math.round(currentPos.y + msg.dy),
								),
							)
						}
					}
				} catch (err) {
					console.error("Error handling move input:", err)
				}
				break

			case "click": {
				const VALID_BUTTONS = ["left", "right", "middle"]
				try {
					if (msg.button && VALID_BUTTONS.includes(msg.button)) {
						const btn =
							msg.button === "left"
								? Button.LEFT
								: msg.button === "right"
									? Button.RIGHT
									: Button.MIDDLE

						if (msg.press) {
							await mouse.pressButton(btn)
						} else {
							await mouse.releaseButton(btn)
						}
					}
				} catch (err) {
					console.error("Error handling click input:", err)
				}
				break
			}

			case "copy": {
				try {
					await keyboard.pressKey(this.modifier, Key.C)
				} catch (err) {
					console.warn("Error while copying:", err)
				} finally {
					await Promise.allSettled([
						keyboard.releaseKey(Key.C),
						keyboard.releaseKey(this.modifier),
					])
				}
				break
			}
			case "paste": {
				try {
					await keyboard.pressKey(this.modifier, Key.V)
				} catch (err) {
					console.warn("Error while pasting:", err)
				} finally {
					await Promise.allSettled([
						keyboard.releaseKey(Key.V),
						keyboard.releaseKey(this.modifier),
					])
				}
				break
			}

			case "scroll": {
				const MAX_SCROLL = 100
				const promises: Promise<void>[] = []

				// Vertical scroll
				if (this.isFiniteNumber(msg.dy) && Math.round(msg.dy) !== 0) {
					const amount = this.clamp(Math.round(msg.dy), -MAX_SCROLL, MAX_SCROLL)
					if (amount > 0) {
						promises.push(mouse.scrollDown(amount).then(() => {}))
					} else if (amount < 0) {
						promises.push(mouse.scrollUp(-amount).then(() => {}))
					}
				}

				// Horizontal scroll
				if (this.isFiniteNumber(msg.dx) && Math.round(msg.dx) !== 0) {
					const amount = this.clamp(Math.round(msg.dx), -MAX_SCROLL, MAX_SCROLL)
					if (amount > 0) {
						promises.push(mouse.scrollRight(amount).then(() => {}))
					} else if (amount < 0) {
						promises.push(mouse.scrollLeft(-amount).then(() => {}))
					}
				}

				if (promises.length) {
					try {
						await Promise.all(promises)
					} catch (err) {
						console.error("Error handling scroll input:", err)
					}
				}
				break
			}

			case "zoom":
				if (this.isFiniteNumber(msg.delta) && msg.delta !== 0) {
					const sensitivityFactor = 0.5
					const MAX_ZOOM_STEP = 5

					const scaledDelta =
						Math.sign(msg.delta) *
						Math.min(Math.abs(msg.delta) * sensitivityFactor, MAX_ZOOM_STEP)

					const amount = Math.round(-scaledDelta)

					if (amount !== 0) {
						await keyboard.pressKey(Key.LeftControl)
						try {
							if (amount > 0) {
								await mouse.scrollDown(amount)
							} else {
								await mouse.scrollUp(-amount)
							}
						} catch (err) {
							console.error("Error handling zoom input:", err)
						} finally {
							await keyboard.releaseKey(Key.LeftControl).catch((releaseErr) => {
								console.error(
									"Error releasing control key after zoom:",
									releaseErr,
								)
							})
						}
					}
				}
				break

			case "key":
				if (msg.key && typeof msg.key === "string" && msg.key.length <= 50) {
					console.log(`Processing key: ${msg.key}`)
					const nutKey = KEY_MAP[msg.key.toLowerCase()]

					if (nutKey !== undefined) {
						try {
							await keyboard.pressKey(nutKey)
						} catch (err) {
							console.error("Error pressing key:", err, msg.key)
						} finally {
							await keyboard.releaseKey(nutKey).catch((releaseErr) => {
								console.error("Error releasing key:", releaseErr, msg.key)
							})
						}
					} else if (msg.key === " " || msg.key?.toLowerCase() === "space") {
						const spaceKey = KEY_MAP.space
						try {
							await keyboard.pressKey(spaceKey)
						} catch (err) {
							console.error("Error pressing space key:", err)
						} finally {
							await keyboard.releaseKey(spaceKey).catch((releaseErr) => {
								console.error("Error releasing space key:", releaseErr)
							})
						}
					} else if (msg.key.length === 1) {
						try {
							await keyboard.type(msg.key)
						} catch (err) {
							console.error("Error typing single key:", err, msg.key)
						}
					} else {
						console.log(`Unmapped key: ${msg.key}`)
					}
				}
				break

			case "combo":
				if (
					msg.keys &&
					Array.isArray(msg.keys) &&
					msg.keys.length > 0 &&
					msg.keys.length <= 10
				) {
					try {
						const nutKeys: (Key | string)[] = []

						for (const k of msg.keys) {
							const lowerKey = k.toLowerCase()
							const nutKey = KEY_MAP[lowerKey]

							if (nutKey !== undefined) {
								nutKeys.push(nutKey)
							} else if (lowerKey.length === 1) {
								nutKeys.push(lowerKey)
							} else {
								console.warn(`Unknown key in combo: ${k}`)
							}
						}

						if (nutKeys.length === 0) {
							console.error("No valid keys in combo")
							return
						}

						console.log("Pressing keys:", nutKeys)
						const pressedKeys: Key[] = []

						try {
							for (const k of nutKeys) {
								if (typeof k === "string") {
									await keyboard.type(k)
								} else {
									await keyboard.pressKey(k)
									pressedKeys.push(k)
								}
							}

							await new Promise((resolve) => setTimeout(resolve, 10))
						} finally {
							for (const k of pressedKeys.reverse()) {
								await keyboard.releaseKey(k).catch((releaseErr) => {
									console.error("Error releasing combo key:", releaseErr, k)
								})
							}
						}
					} catch (err) {
						console.error("Error handling combo input:", err, msg.keys)
					}

					console.log(`Combo complete: ${msg.keys.join("+")}`)
				}
				break

			case "text":
				if (msg.text && typeof msg.text === "string") {
					try {
						await keyboard.type(msg.text)
					} catch (err) {
						console.error("Error typing text input:", err)
					}
				}
				break
		}
	}
}
