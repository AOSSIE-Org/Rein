import { postMouseEvent, postScrollEvent, postKeyEvent } from "./structs"
import {
	kCGEventLeftMouseDown,
	kCGEventLeftMouseUp,
	kCGEventLeftMouseDragged,
	kCGMouseButtonLeft,
} from "./constants"
import { MAC_KEY_MAP } from "../keyMap"
import type { TouchContact } from "../types"
import { PINCH_PAN_THRESHOLD } from "../constants"

interface TrackedContact {
	id: number
	x: number
	y: number
	state: "down" | "move" | "up"
}

interface PinchState {
	contactIds: [number, number]
	lastSpread: number
}

const PINCH_SCROLL_SCALE = 0.05

export class MacTouch {
	private activeContacts = new Map<number, TrackedContact>()
	private pinch: PinchState | null = null

	injectTouch(contacts: TouchContact[]): void {
		if (contacts.length === 0) return

		const downs: TouchContact[] = []
		const moves: TouchContact[] = []
		const ups: TouchContact[] = []

		for (const c of contacts) {
			if (c.state === "down") downs.push(c)
			else if (c.state === "move") moves.push(c)
			else ups.push(c)
		}

		this.processDowns(downs)
		this.processMoves(moves)
		this.processUps(ups)
	}

	releaseAll(): void {
		if (this.activeContacts.size === 0) return

		const first = [...this.activeContacts.values()][0]
		postMouseEvent(kCGEventLeftMouseUp, first.x, first.y, kCGMouseButtonLeft)
		this.activeContacts.clear()
		this.pinch = null
	}

	private processDowns(downs: TouchContact[]): void {
		for (const c of downs) {
			this.activeContacts.set(c.id, { ...c })
		}

		const active = this.activeContacts.size

		if (active === 1 && downs.length > 0) {
			const c = downs[0]
			postMouseEvent(kCGEventLeftMouseDown, c.x, c.y, kCGMouseButtonLeft)
			this.pinch = null
		} else if (active === 2) {
			const first = [...this.activeContacts.values()][0]
			postMouseEvent(kCGEventLeftMouseUp, first.x, first.y, kCGMouseButtonLeft)
			this.pinch = this.buildPinchState()
		} else if (active > 2) {
			console.warn(
				`[MacTouch] ${active}-finger touches are not supported on macOS — ignoring`,
			)
		}
	}

	private processMoves(moves: TouchContact[]): void {
		for (const c of moves) {
			const prev = this.activeContacts.get(c.id)
			const active = this.activeContacts.size

			if (active === 1 && prev) {
				postMouseEvent(kCGEventLeftMouseDragged, c.x, c.y, kCGMouseButtonLeft)
			} else if (active === 2) {
				this.handleTwoFingerMove(c, prev)
			}

			this.activeContacts.set(c.id, { ...c })
		}
	}

	private processUps(ups: TouchContact[]): void {
		for (const c of ups) {
			const prev = this.activeContacts.get(c.id)
			this.activeContacts.delete(c.id)

			if (this.activeContacts.size === 0 && prev) {
				postMouseEvent(kCGEventLeftMouseUp, c.x, c.y, kCGMouseButtonLeft)
				this.pinch = null
			} else if (this.activeContacts.size === 1 && this.pinch) {
				this.pinch = null
				const remaining = [...this.activeContacts.values()][0]
				postMouseEvent(
					kCGEventLeftMouseDown,
					remaining.x,
					remaining.y,
					kCGMouseButtonLeft,
				)
			}
		}
	}

	private handleTwoFingerMove(
		c: TouchContact,
		prev: TrackedContact | undefined,
	): void {
		if (!this.pinch) {
			this.pinch = this.buildPinchState()
			return
		}

		if (c.id !== this.pinch.contactIds[0]) return

		const contacts = [...this.activeContacts.values()]
		if (contacts.length < 2) return

		const [a, b] = contacts
		const newSpread = spread(a, b)
		const delta = newSpread - this.pinch.lastSpread

		const isPinch = Math.abs(delta) > PINCH_PAN_THRESHOLD
		const isPan = !isPinch

		if (isPinch) {
			this.emitPinchZoom(delta)
			this.pinch.lastSpread = newSpread
		} else if (isPan) {
			const otherPrev = this.activeContacts.get(
				c.id === this.pinch.contactIds[0]
					? this.pinch.contactIds[1]
					: this.pinch.contactIds[0],
			)
			if (prev && otherPrev) {
				const dx = c.x - (prev?.x ?? c.x)
				const dy = c.y - (prev?.y ?? c.y)
				postScrollEvent(dx, -dy)
			}
		}
	}

	private emitPinchZoom(spreadDelta: number): void {
		const lines = Math.round(spreadDelta * PINCH_SCROLL_SCALE)
		if (lines === 0) return

		const ctrlCode = MAC_KEY_MAP.control
		if (ctrlCode === undefined) {
			console.warn(
				"[MacTouch] Control key code not defined in key map — cannot emit pinch zoom",
			)
			return
		}
		postKeyEvent(ctrlCode, true)
		postScrollEvent(0, lines)
		postKeyEvent(ctrlCode, false)
	}

	private buildPinchState(): PinchState | null {
		const contacts = [...this.activeContacts.values()]
		if (contacts.length < 2) return null
		return {
			contactIds: [contacts[0].id, contacts[1].id],
			lastSpread: spread(contacts[0], contacts[1]),
		}
	}
}

function spread(
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return Math.sqrt(dx * dx + dy * dy)
}
