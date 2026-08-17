import { writeEvent } from "./structs"
import {
	EV_SYN,
	EV_ABS,
	EV_KEY,
	SYN_REPORT,
	ABS_MT_SLOT,
	ABS_MT_TRACKING_ID,
	ABS_MT_POSITION_X,
	ABS_MT_POSITION_Y,
	ABS_MT_PRESSURE,
	ABS_MT_TOUCH_MAJOR,
	BTN_TOUCH,
	BTN_TOOL_FINGER,
	BTN_TOOL_DOUBLETAP,
	BTN_TOOL_TRIPLETAP,
	BTN_TOOL_QUADTAP,
	KEY_PRESS,
	KEY_RELEASE,
	MAX_CONTACTS,
	MT_TRACKING_ID_RELEASED,
} from "./constants"
import type { TouchContact } from "../types"

export class LinuxTouch {
	private fd: number
	private slotTrackingIds: Int32Array
	private contactSlotMap = new Map<number, number>()
	private freeSlots: number[] = []
	private nextTrackingId = 1
	private activeContactCount = 0

	constructor(fd: number) {
		this.fd = fd
		this.slotTrackingIds = new Int32Array(MAX_CONTACTS).fill(
			MT_TRACKING_ID_RELEASED,
		)
		for (let i = MAX_CONTACTS - 1; i >= 0; i--) {
			this.freeSlots.push(i)
		}
	}

	injectTouch(contacts: TouchContact[]): void {
		if (contacts.length === 0) return

		const releasedSourceIds: number[] = []
		let slotChanged = -1

		for (const contact of contacts) {
			if (contact.state === "up") {
				this.liftContact(contact.id)
				releasedSourceIds.push(contact.id)
				continue
			}

			let slot = this.contactSlotMap.get(contact.id)

			if (slot === undefined) {
				const free = this.freeSlots.pop()
				if (free === undefined) {
					console.warn("[LinuxTouch] Max contacts reached")
					continue
				}
				slot = free
				this.contactSlotMap.set(contact.id, slot)
				this.nextTrackingId = (this.nextTrackingId % 0x7fffffff) + 1
				this.slotTrackingIds[slot] = this.nextTrackingId
				this.activeContactCount++

				this.selectSlot(slot, slotChanged)
				slotChanged = slot
				writeEvent(this.fd, EV_ABS, ABS_MT_TRACKING_ID, this.nextTrackingId)
			} else if (slot !== slotChanged) {
				this.selectSlot(slot, slotChanged)
				slotChanged = slot
			}

			writeEvent(this.fd, EV_ABS, ABS_MT_POSITION_X, Math.round(contact.x))
			writeEvent(this.fd, EV_ABS, ABS_MT_POSITION_Y, Math.round(contact.y))
			writeEvent(this.fd, EV_ABS, ABS_MT_PRESSURE, 128)
			writeEvent(this.fd, EV_ABS, ABS_MT_TOUCH_MAJOR, 4)
		}

		this.emitToolButtons()
		this.sync()

		for (const id of releasedSourceIds) {
			const slot = this.contactSlotMap.get(id)
			if (slot !== undefined) {
				this.contactSlotMap.delete(id)
				this.freeSlots.push(slot)
			}
		}
	}

	releaseAll(): void {
		if (this.contactSlotMap.size === 0) return

		for (const [, slot] of this.contactSlotMap) {
			writeEvent(this.fd, EV_ABS, ABS_MT_SLOT, slot)
			writeEvent(this.fd, EV_ABS, ABS_MT_TRACKING_ID, MT_TRACKING_ID_RELEASED)
		}

		writeEvent(this.fd, EV_KEY, BTN_TOUCH, KEY_RELEASE)
		writeEvent(this.fd, EV_KEY, BTN_TOOL_FINGER, KEY_RELEASE)
		this.sync()

		this.contactSlotMap.clear()
		this.slotTrackingIds.fill(MT_TRACKING_ID_RELEASED)
		this.freeSlots = Array.from(
			{ length: MAX_CONTACTS },
			(_, i) => MAX_CONTACTS - 1 - i,
		)
		this.activeContactCount = 0
	}

	private liftContact(sourceId: number): void {
		const slot = this.contactSlotMap.get(sourceId)
		if (slot === undefined) return

		writeEvent(this.fd, EV_ABS, ABS_MT_SLOT, slot)
		writeEvent(this.fd, EV_ABS, ABS_MT_TRACKING_ID, MT_TRACKING_ID_RELEASED)
		this.slotTrackingIds[slot] = MT_TRACKING_ID_RELEASED
		this.activeContactCount = Math.max(0, this.activeContactCount - 1)
	}

	private selectSlot(slot: number, currentSlot: number): void {
		if (slot !== currentSlot) {
			writeEvent(this.fd, EV_ABS, ABS_MT_SLOT, slot)
		}
	}

	private emitToolButtons(): void {
		const n = this.activeContactCount
		writeEvent(this.fd, EV_KEY, BTN_TOUCH, n > 0 ? KEY_PRESS : KEY_RELEASE)
		writeEvent(
			this.fd,
			EV_KEY,
			BTN_TOOL_FINGER,
			n === 1 ? KEY_PRESS : KEY_RELEASE,
		)
		writeEvent(
			this.fd,
			EV_KEY,
			BTN_TOOL_DOUBLETAP,
			n === 2 ? KEY_PRESS : KEY_RELEASE,
		)
		writeEvent(
			this.fd,
			EV_KEY,
			BTN_TOOL_TRIPLETAP,
			n === 3 ? KEY_PRESS : KEY_RELEASE,
		)
		writeEvent(
			this.fd,
			EV_KEY,
			BTN_TOOL_QUADTAP,
			n >= 4 ? KEY_PRESS : KEY_RELEASE,
		)
	}

	private sync(): void {
		writeEvent(this.fd, EV_SYN, SYN_REPORT, 0)
	}
}
