import koffi from "koffi"
import { CreateSyntheticPointerDevice, InjectPointerInput } from "./structs"
import {
	PT_TOUCHPAD,
	POINTER_FEEDBACK_DEFAULT,
	POINTER_FLAG_NEW,
	POINTER_FLAG_INRANGE,
	POINTER_FLAG_INCONTACT,
	POINTER_FLAG_PRIMARY,
	POINTER_FLAG_DOWN,
	POINTER_FLAG_UPDATE,
	POINTER_FLAG_UP,
	TOUCH_MASK_CONTACTAREA,
	MAX_CONTACTS,
} from "./constants"
import type { TouchContact } from "../types"

export class WindowsTouch {
	private hDevice: bigint | null = null
	private contactIdMap = new Map<number, number>()
	private freePointerIds: number[] = []
	private primarySourceId: number | null = null
	private currentFrameId = 1

	constructor() {
		for (let i = MAX_CONTACTS - 1; i >= 0; i--) {
			this.freePointerIds.push(i)
		}
		this.initialize()
	}

	private initialize(): void {
		if (this.hDevice) return

		const handle = CreateSyntheticPointerDevice(
			PT_TOUCHPAD,
			MAX_CONTACTS,
			POINTER_FEEDBACK_DEFAULT,
		)

		if (handle) {
			try {
				this.hDevice = koffi.address(handle)
				console.log("[WindowsTouch] Touch device initialized")
			} catch (e) {
				console.error("[WindowsTouch] Failed to initialize touch device:", e)
				return
			}
		} else {
			console.error("[WindowsTouch] Failed to create touch device")
		}
	}

	private getOrAllocPointerId(sourceId: number): number {
		const existing = this.contactIdMap.get(sourceId)
		if (existing !== undefined) return existing

		const id = this.freePointerIds.pop()
		if (id === undefined) {
			console.warn("[WindowsTouch] Max contacts reached")
			throw new Error("Cannot allocate pointer ID: max contacts reached")
		}
		this.contactIdMap.set(sourceId, id)
		return id
	}

	injectTouch(contacts: TouchContact[]): void {
		if (!this.hDevice || contacts.length === 0) return

		if (this.primarySourceId === null) {
			const firstDown = contacts.find((c) => c.state === "down")
			this.primarySourceId = firstDown ? firstDown.id : contacts[0].id
		}

		const releasedIds: number[] = []
		const frame: Array<{ type: number; touchInfo: Record<string, unknown> }> =
			[]

		for (const contact of contacts) {
			const winId = this.getOrAllocPointerId(contact.id)
			let flags = POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT

			switch (contact.state) {
				case "down":
					flags |= POINTER_FLAG_DOWN | POINTER_FLAG_NEW
					break
				case "move":
					flags |= POINTER_FLAG_UPDATE
					break
				case "up":
					flags = (flags | POINTER_FLAG_UP) & ~POINTER_FLAG_INCONTACT
					releasedIds.push(contact.id)
					break
			}

			if (contact.id === this.primarySourceId) {
				flags |= POINTER_FLAG_PRIMARY
			}

			const x = Math.round(contact.x)
			const y = Math.round(contact.y)
			const contactSize = 2

			frame.push({
				type: PT_TOUCHPAD,
				touchInfo: {
					pointerInfo: {
						pointerType: PT_TOUCHPAD,
						pointerId: winId,
						frameId: this.currentFrameId,
						pointerFlags: flags,
						sourceDevice: null,
						hwndTarget: null,
						ptPixelLocation: { x, y },
						ptHimetricLocation: { x: 0, y: 0 },
						ptPixelLocationRaw: { x: 0, y: 0 },
						ptHimetricLocationRaw: { x: 0, y: 0 },
						dwTime: 0,
						historyCount: 0,
						InputData: 0,
						dwKeyStates: 0,
						PerformanceCount: 0,
						ButtonChangeType: 0,
					},
					touchFlags: 0,
					touchMask: TOUCH_MASK_CONTACTAREA,
					rcContact: {
						left: x - contactSize,
						top: y - contactSize,
						right: x + contactSize,
						bottom: y + contactSize,
					},
					rcContactRaw: {
						left: x - contactSize,
						top: y - contactSize,
						right: x + contactSize,
						bottom: y + contactSize,
					},
					orientation: 0,
					pressure: 512,
				},
			})
		}

		frame.sort(
			(a, b) =>
				(a.touchInfo as { pointerInfo: { pointerId: number } }).pointerInfo
					.pointerId -
				(b.touchInfo as { pointerInfo: { pointerId: number } }).pointerInfo
					.pointerId,
		)

		try {
			if (InjectPointerInput(this.hDevice, frame, frame.length)) {
				this.currentFrameId = (this.currentFrameId % 0xffffffff) + 1
			}
		} catch (e) {
			console.error("[WindowsTouch] Error injecting pointer input:", e)
		}

		for (const id of releasedIds) {
			const winId = this.contactIdMap.get(id)
			if (winId !== undefined) {
				this.contactIdMap.delete(id)
				if (!this.freePointerIds.includes(winId)) {
					this.freePointerIds.push(winId)
				}
			}
		}

		if (this.contactIdMap.size === 0) {
			this.primarySourceId = null
		}
	}

	destroy(): void {
		if (this.hDevice) {
			const releases: TouchContact[] = []
			for (const sourceId of this.contactIdMap.keys()) {
				releases.push({ id: sourceId, x: 0, y: 0, state: "up" })
			}
			if (releases.length > 0) {
				this.injectTouch(releases)
			}

			this.hDevice = null
			this.contactIdMap.clear()
			this.freePointerIds = []
			for (let i = MAX_CONTACTS - 1; i >= 0; i--) {
				this.freePointerIds.push(i)
			}
			this.primarySourceId = null
		}
	}
}
