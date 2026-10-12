/**
 * Linux virtual touch device implementation.
 *
 * Manages multi-touch contact tracking using the Linux MT slot protocol,
 * handling contact allocation, movement, release, and synchronization
 * while emitting the appropriate touch and tool events to a uinput device.
 */
import type { UinputDevice } from "@imxade/inject/linux"
import {
	EV_ABS,
	EV_KEY,
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
} from "./constants.ts"
import type { TouchContact } from "../../types.ts"

export class LinuxTouch {
	private device: UinputDevice
	// slot :tracking id
	private slotTrackingIds: Int32Array
	// sourceId :slot index
	private contactSlotMap = new Map<number, number>()
	private freeSlots: number[] = []
	private nextTrackingId = 1
	private activeContactCount = 0

	constructor(device: UinputDevice) {
		this.device = device
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
				// New contact — allocate a slot
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

				// Assign slot + tracking id
				this.selectSlot(slot, slotChanged)
				slotChanged = slot
				this.device.emit(EV_ABS, ABS_MT_TRACKING_ID, this.nextTrackingId)
			} else if (slot !== slotChanged) {
				this.selectSlot(slot, slotChanged)
				slotChanged = slot
			}

			this.device.emit(EV_ABS, ABS_MT_POSITION_X, Math.round(contact.x))
			this.device.emit(EV_ABS, ABS_MT_POSITION_Y, Math.round(contact.y))
			this.device.emit(EV_ABS, ABS_MT_PRESSURE, 128)
			this.device.emit(EV_ABS, ABS_MT_TOUCH_MAJOR, 4)
		}

		// Update BTN_TOUCH / BTN_TOOL_* based on live contact count
		this.emitToolButtons()
		this.sync()

		// Clean up released slots after sync
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
			this.device.emit(EV_ABS, ABS_MT_SLOT, slot)
			this.device.emit(EV_ABS, ABS_MT_TRACKING_ID, MT_TRACKING_ID_RELEASED)
		}

		this.device.emit(EV_KEY, BTN_TOUCH, KEY_RELEASE)
		this.device.emit(EV_KEY, BTN_TOOL_FINGER, KEY_RELEASE)
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

		this.device.emit(EV_ABS, ABS_MT_SLOT, slot)
		this.device.emit(EV_ABS, ABS_MT_TRACKING_ID, MT_TRACKING_ID_RELEASED)
		this.slotTrackingIds[slot] = MT_TRACKING_ID_RELEASED
		this.activeContactCount = Math.max(0, this.activeContactCount - 1)
	}

	private selectSlot(slot: number, currentSlot: number): void {
		if (slot !== currentSlot) {
			this.device.emit(EV_ABS, ABS_MT_SLOT, slot)
		}
	}

	private emitToolButtons(): void {
		const n = this.activeContactCount
		this.device.emit(EV_KEY, BTN_TOUCH, n > 0 ? KEY_PRESS : KEY_RELEASE)
		this.device.emit(EV_KEY, BTN_TOOL_FINGER, n === 1 ? KEY_PRESS : KEY_RELEASE)
		this.device.emit(
			EV_KEY,
			BTN_TOOL_DOUBLETAP,
			n === 2 ? KEY_PRESS : KEY_RELEASE,
		)
		this.device.emit(
			EV_KEY,
			BTN_TOOL_TRIPLETAP,
			n === 3 ? KEY_PRESS : KEY_RELEASE,
		)
		this.device.emit(EV_KEY, BTN_TOOL_QUADTAP, n >= 4 ? KEY_PRESS : KEY_RELEASE)
	}

	private sync(): void {
		this.device.sync()
	}
}
