import { useEffect, useRef, useState } from "react"
import {
	PINCH_THRESHOLD,
	TOUCH_MOVE_THRESHOLD,
	TOUCH_TIMEOUT,
	calculateAccelerationMult,
} from "../utils/math"

interface TrackedTouch {
	identifier: number
	pageX: number
	pageY: number
	pageXStart: number
	pageYStart: number
	timeStamp: number
}

const getTouchDistance = (a: TrackedTouch, b: TrackedTouch): number => {
	const dx = a.pageX - b.pageX
	const dy = a.pageY - b.pageY
	return Math.sqrt(dx * dx + dy * dy)
}

const BUTTON_MAP: Record<number, "left" | "right" | "middle"> = {
	1: "left",
	2: "right",
	3: "middle",
}

export const useTrackpadGesture = (
	send: (msg: unknown) => void,
	scrollMode: boolean,
	sensitivity = 1.5,
	invertScroll = false,
	axisThreshold = 2.5,
) => {
	const [isTracking, setIsTracking] = useState(false)

	// Refs for tracking state (avoids re-renders during rapid movement)
	const ongoingTouches = useRef<Map<number, TrackedTouch>>(new Map())
	const moved = useRef(false)
	const startTimeStamp = useRef(0)
	const releasedCount = useRef(0)
	const dragging = useRef(false)
	const draggingTimeout = useRef<NodeJS.Timeout | null>(null)
	const lastPinchDist = useRef<number | null>(null)
	const pinching = useRef(false)

	const processMovement = (sumX: number, sumY: number) => {
		const touchCount = ongoingTouches.current.size
		if (dragging.current) {
			send({
				type: "move",
				dx: Math.round(sumX * sensitivity * 10) / 10,
				dy: Math.round(sumY * sensitivity * 10) / 10,
			})
			return
		}
		const invertMult = invertScroll ? -1 : 1
		if (!scrollMode && touchCount === 2) {
			const touches = Array.from(ongoingTouches.current.values())
			const dist = getTouchDistance(touches[0], touches[1])
			const delta =
				lastPinchDist.current !== null ? dist - lastPinchDist.current : 0
			if (pinching.current || Math.abs(delta) > PINCH_THRESHOLD) {
				pinching.current = true
				lastPinchDist.current = dist
				send({ type: "zoom", delta: delta * sensitivity * invertMult })
			} else {
				lastPinchDist.current = dist
				send({
					type: "scroll",
					dx: -sumX * sensitivity * invertMult,
					dy: -sumY * sensitivity * invertMult,
				})
			}
		} else if (scrollMode || touchCount === 2) {
			let scrollDx = sumX
			let scrollDy = sumY
			if (scrollMode) {
				const absDx = Math.abs(scrollDx)
				const absDy = Math.abs(scrollDy)
				if (absDx > absDy * axisThreshold) {
					scrollDy = 0
				} else if (absDy > absDx * axisThreshold) {
					scrollDx = 0
				}
			}
			send({
				type: "scroll",
				dx: Math.round(-scrollDx * sensitivity * 10 * invertMult) / 10,
				dy: Math.round(-scrollDy * sensitivity * 10 * invertMult) / 10,
			})
		} else if (touchCount === 1) {
			send({
				type: "move",
				dx: Math.round(sumX * sensitivity * 10) / 10,
				dy: Math.round(sumY * sensitivity * 10) / 10,
			})
		}
	}

	const handleDraggingTimeout = () => {
		draggingTimeout.current = null
		send({ type: "click", button: "left", press: false })
	}

	const handleTouchStart = (e: React.TouchEvent) => {
		if (ongoingTouches.current.size === 0) {
			startTimeStamp.current = e.timeStamp
			moved.current = false
		}

		const touches = e.changedTouches
		for (let i = 0; i < touches.length; i++) {
			const touch = touches[i]
			ongoingTouches.current.set(touch.identifier, {
				identifier: touch.identifier,
				pageX: touch.pageX,
				pageY: touch.pageY,
				pageXStart: touch.pageX,
				pageYStart: touch.pageY,
				timeStamp: e.timeStamp,
			})
		}

		if (ongoingTouches.current.size === 2) {
			const touches = Array.from(ongoingTouches.current.values())
			lastPinchDist.current = getTouchDistance(touches[0], touches[1])
			pinching.current = false
		}

		setIsTracking(true)

		// If we're in dragging timeout, convert to actual drag
		if (draggingTimeout.current) {
			clearTimeout(draggingTimeout.current)
			draggingTimeout.current = null
			dragging.current = true
		}
	}

	const handleTouchMove = (e: React.TouchEvent) => {
		const touches = e.changedTouches
		let sumX = 0
		let sumY = 0
		let movedTouchesCount = 0
		const touchCount = ongoingTouches.current.size

		for (let i = 0; i < touches.length; i++) {
			const touch = touches[i]
			const tracked = ongoingTouches.current.get(touch.identifier)
			if (!tracked) continue

			movedTouchesCount++

			// Check if we've moved enough to consider this a "move" gesture
			if (!moved.current) {
				const distSq =
					(touch.pageX - tracked.pageXStart) ** 2 +
					(touch.pageY - tracked.pageYStart) ** 2
				const thresholdIndex = Math.min(
					touchCount - 1,
					TOUCH_MOVE_THRESHOLD.length - 1,
				)
				const threshold = TOUCH_MOVE_THRESHOLD[thresholdIndex]
				const thresholdSq = threshold * threshold

				if (
					distSq > thresholdSq ||
					e.timeStamp - startTimeStamp.current >= TOUCH_TIMEOUT
				) {
					moved.current = true
				}
			}

			// Calculate delta with acceleration
			const dx = touch.pageX - tracked.pageX
			const dy = touch.pageY - tracked.pageY
			const timeDelta = e.timeStamp - tracked.timeStamp

			if (timeDelta > 0) {
				const speedX = (Math.abs(dx) / timeDelta) * 1000
				const speedY = (Math.abs(dy) / timeDelta) * 1000
				sumX += dx * calculateAccelerationMult(speedX)
				sumY += dy * calculateAccelerationMult(speedY)
			}

			// Update tracked position
			tracked.pageX = touch.pageX
			tracked.pageY = touch.pageY
			tracked.timeStamp = e.timeStamp
		}

		// Normalize movement by number of touches that actually moved to prevent sensitivity doubling
		if (moved.current && movedTouchesCount > 0) {
			processMovement(sumX / movedTouchesCount, sumY / movedTouchesCount)
		}
	}

	const handleTouchEnd = (e: React.TouchEvent) => {
		const touches = e.changedTouches

		for (let i = 0; i < touches.length; i++) {
			if (ongoingTouches.current.has(touches[i].identifier)) {
				ongoingTouches.current.delete(touches[i].identifier)
				releasedCount.current += 1
			}
		}

		if (ongoingTouches.current.size < 2) {
			lastPinchDist.current = null
			pinching.current = false
		}

		// Mark as moved if too many fingers
		if (releasedCount.current > TOUCH_MOVE_THRESHOLD.length) {
			moved.current = true
		}

		// All fingers lifted
		if (ongoingTouches.current.size === 0 && releasedCount.current >= 1) {
			setIsTracking(false)

			// Release drag if active
			if (dragging.current) {
				dragging.current = false
				send({ type: "click", button: "left", press: false })
			}

			// Handle tap/click if not moved and within timeout
			if (
				!moved.current &&
				e.timeStamp - startTimeStamp.current < TOUCH_TIMEOUT
			) {
				const button = BUTTON_MAP[releasedCount.current]

				if (button) {
					send({ type: "click", button, press: true })

					// For left click, set up drag timeout
					if (button === "left") {
						draggingTimeout.current = setTimeout(
							handleDraggingTimeout,
							TOUCH_TIMEOUT,
						)
					} else {
						send({ type: "click", button, press: false })
					}
				}
			}

			releasedCount.current = 0
		}
	}

	// Cleanup: clear any pending drag timeout on unmount
	useEffect(() => {
		return () => {
			if (draggingTimeout.current) {
				clearTimeout(draggingTimeout.current)
				draggingTimeout.current = null
			}
		}
	}, [])

	return {
		isTracking,
		handlers: {
			onTouchStart: handleTouchStart,
			onTouchMove: handleTouchMove,
			onTouchEnd: handleTouchEnd,
		},
	}
}
