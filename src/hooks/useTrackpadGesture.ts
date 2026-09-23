import { useEffect, useRef, useState } from "react"

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
	const TOUCH_MOVE_THRESHOLD = [10, 15, 15]
	const TOUCH_TIMEOUT = 250
	const PINCH_THRESHOLD = 10
	const lastPinchDist = useRef<number | null>(null)
	const pinching = useRef(false)

	const processMovement = (sumX: number, sumY: number) => {
		const touchCount = ongoingTouches.current.size

		if (dragging.current) {
			send({ type: "move", dx: sumX, dy: sumY })
			return
		}

		if (!scrollMode && touchCount === 2) {
			const touches = Array.from(ongoingTouches.current.values())
			const dist = getTouchDistance(touches[0], touches[1])
			const delta =
				lastPinchDist.current !== null ? dist - lastPinchDist.current : 0
			if (pinching.current || Math.abs(delta) > PINCH_THRESHOLD) {
				pinching.current = true
				lastPinchDist.current = dist
				send({ type: "zoom", delta })
			} else {
				lastPinchDist.current = dist
				send({ type: "scroll", dx: -sumX, dy: -sumY })
			}
		} else if (scrollMode || touchCount === 2) {
			let dx = sumX,
				dy = sumY
			if (scrollMode) {
				const absDx = Math.abs(dx),
					absDy = Math.abs(dy)
				if (absDx > absDy * axisThreshold) dy = 0
				else if (absDy > absDx * axisThreshold) dx = 0
			}
			send({ type: "scroll", dx: -dx, dy: -dy })
		} else if (touchCount === 1) {
			send({ type: "move", dx: sumX, dy: sumY })
		}
	}

	const handleDraggingTimeout = () => {
		draggingTimeout.current = null
		send({ type: "click", button: "left", press: false })
	}

	const handleTouchStart = (e: React.TouchEvent) => {
		if (ongoingTouches.current.size === 0) {
			startTimeStamp.current = e.timeStamp
		}
		moved.current = false
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
			const dx = touch.pageX - tracked.pageX
			const dy = touch.pageY - tracked.pageY
			sumX += dx
			sumY += dy

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

	const handleTouchCancel = (e: React.TouchEvent) => {
		const touches = e.changedTouches

		// Remove all cancelled touches from tracking
		for (let i = 0; i < touches.length; i++) {
			ongoingTouches.current.delete(touches[i].identifier)
		}

		// If no touches remain, fully reset the gesture state
		if (ongoingTouches.current.size === 0) {
			setIsTracking(false)
			moved.current = false
			releasedCount.current = 0
			lastPinchDist.current = null
			pinching.current = false

			if (dragging.current) {
				dragging.current = false
				send({ type: "click", button: "left", press: false })
			}

			if (draggingTimeout.current) {
				clearTimeout(draggingTimeout.current)
				draggingTimeout.current = null
			}
		} else if (ongoingTouches.current.size < 2) {
			lastPinchDist.current = null
			pinching.current = false
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
			onTouchCancel: handleTouchCancel,
		},
	}
}
