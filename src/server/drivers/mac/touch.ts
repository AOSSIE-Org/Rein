/**
 * macOS touch input implementation.
 *
 * Translates touch contacts into mouse, scrolling, and pinch-zoom
 * interactions using CoreGraphics events. Supports single-finger
 * dragging, two-finger scrolling, and pinch gesture emulation while
 * tracking active touch contacts and gesture state.
 */
import {
	postMouseEvent,
	postScrollEvent,
	postKeyEvent,
} from "@imxade/inject/mac"
import {
	kCGHIDEventTap,
	kCGScrollEventUnitLine,
	kCGEventLeftMouseDown,
	kCGEventLeftMouseUp,
	kCGEventLeftMouseDragged,
	kCGMouseButtonLeft,
} from "./constants.ts"

function postMouse(
	eventType: number,
	x: number,
	y: number,
	button: number,
): void {
	postMouseEvent(kCGHIDEventTap, eventType, x, y, button)
}

function postScroll(deltaX: number, deltaY: number): void {
	postScrollEvent(
		kCGHIDEventTap,
		kCGScrollEventUnitLine,
		Math.round(deltaY),
		Math.round(deltaX),
	)
}

function postKey(keyCode: number, keyDown: boolean): void {
	postKeyEvent(kCGHIDEventTap, keyCode, keyDown)
}
import { MAC_KEY_MAP } from "../keyMap.ts"
import type { TouchContact } from "../../types.ts"
import { PINCH_PAN_THRESHOLD } from "../../constants.ts"
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
		postMouse(kCGEventLeftMouseUp, first.x, first.y, kCGMouseButtonLeft)
		this.activeContacts.clear()
		this.pinch = null
	}

	// Lifecycle

	private processDowns(downs: TouchContact[]): void {
		for (const c of downs) {
			this.activeContacts.set(c.id, { ...c })
		}

		const active = this.activeContacts.size

		if (active === 1 && downs.length > 0) {
			// First finger touching — start a mouse press
			const c = downs[0]
			postMouse(kCGEventLeftMouseDown, c.x, c.y, kCGMouseButtonLeft)
			this.pinch = null
		} else if (active === 2) {
			// Second finger arrived — lift the simulated mouse press and switch
			// to two-finger / pinch mode
			const first = [...this.activeContacts.values()][0]
			postMouse(kCGEventLeftMouseUp, first.x, first.y, kCGMouseButtonLeft)
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
				// Single-finger drag
				postMouse(kCGEventLeftMouseDragged, c.x, c.y, kCGMouseButtonLeft)
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
				// Last finger lifted
				postMouse(kCGEventLeftMouseUp, c.x, c.y, kCGMouseButtonLeft)
				this.pinch = null
			} else if (this.activeContacts.size === 1 && this.pinch) {
				// Dropped from 2 → 1 finger: re-press at the remaining finger's pos
				this.pinch = null
				const remaining = [...this.activeContacts.values()][0]
				postMouse(
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

		// Only process once per pair (use the first contact id as the trigger)
		if (c.id !== this.pinch.contactIds[0]) return

		const contacts = [...this.activeContacts.values()]
		if (contacts.length < 2) return

		const [a, b] = contacts
		const newSpread = spread(a, b)
		const delta = newSpread - this.pinch.lastSpread

		const isPinch = Math.abs(delta) > PINCH_PAN_THRESHOLD // px threshold to distinguish pan from pinch
		const isPan = !isPinch

		if (isPinch) {
			this.emitPinchZoom(delta)
			this.pinch.lastSpread = newSpread
		} else if (isPan) {
			// Two-finger pan → scroll
			// Use the centroid velocity for scroll amount
			const otherPrev = this.activeContacts.get(
				c.id === this.pinch.contactIds[0]
					? this.pinch.contactIds[1]
					: this.pinch.contactIds[0],
			)
			if (prev && otherPrev) {
				// Average delta across both fingers for stable scroll
				const dx = c.x - (prev?.x ?? c.x)
				const dy = c.y - (prev?.y ?? c.y)
				// CG scroll: positive Y = scroll up; finger moving down = scroll down
				postScroll(dx, -dy)
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
		postKey(ctrlCode, true)
		postScroll(0, lines)
		postKey(ctrlCode, false)
	}

	//Helpers

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
