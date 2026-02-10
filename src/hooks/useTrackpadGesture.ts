import { useRef, useState } from 'react';
import { TOUCH_MOVE_THRESHOLD, TOUCH_TIMEOUT, PINCH_THRESHOLD, calculateAccelerationMult } from '../utils/math';

interface TrackedTouch {
    identifier: number;
    pageX: number;
    pageY: number;
    pageXStart: number;
    pageYStart: number;
    timeStamp: number;
}

const getTouchDistance = (a: TrackedTouch, b: TrackedTouch): number => {
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
};

export const useTrackpadGesture = (
    send: (msg: any) => void,
    scrollMode: boolean,
    sensitivity: number = 1.5
) => {
    const [isTracking, setIsTracking] = useState(false);
    
    // Refs for tracking state (avoids re-renders during rapid movement)
    const ongoingTouches = useRef<TrackedTouch[]>([]);
    const moved = useRef(false);
    const startTimeStamp = useRef(0);
    const lastEndTimeStamp = useRef(0);
    const releasedCount = useRef(0);
    const dragging = useRef(false);
    const draggingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPinchDist = useRef<number | null>(null);
    const pinching = useRef(false);

    // Helpers
    const findTouchIndex = (id: number) => ongoingTouches.current.findIndex(t => t.identifier === id);

    const handleDraggingTimeout = () => {
        draggingTimeout.current = null;
        send({ type: 'click', button: 'left', press: false });
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (ongoingTouches.current.length === 0) {
            startTimeStamp.current = e.timeStamp;
            moved.current = false;
        }

        const touches = e.changedTouches;
        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            const tracked: TrackedTouch = {
                identifier: touch.identifier,
                pageX: touch.pageX,
                pageY: touch.pageY,
                pageXStart: touch.pageX,
                pageYStart: touch.pageY,
                timeStamp: e.timeStamp,
            };
            const idx = findTouchIndex(touch.identifier);
            if (idx < 0) {
                ongoingTouches.current.push(tracked);
            } else {
                ongoingTouches.current[idx] = tracked;
            }
        }

        if (ongoingTouches.current.length === 2) {
            lastPinchDist.current = getTouchDistance(ongoingTouches.current[0], ongoingTouches.current[1]);
            pinching.current = false;
        }

        setIsTracking(true);
        lastEndTimeStamp.current = 0;

        // If we're in dragging timeout, convert to actual drag
        if (draggingTimeout.current) {
            clearTimeout(draggingTimeout.current);
            draggingTimeout.current = null;
            dragging.current = true;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {

        const touches = e.changedTouches;
        let sumX = 0;
        let sumY = 0;

        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            const idx = findTouchIndex(touch.identifier);
            if (idx < 0) continue;

            const tracked = ongoingTouches.current[idx];

            // Check if we've moved enough to consider this a "move" gesture
            if (!moved.current) {
                const dist = Math.sqrt(
                    Math.pow(touch.pageX - tracked.pageXStart, 2) +
                    Math.pow(touch.pageY - tracked.pageYStart, 2)
                );
                const threshold = ongoingTouches.current.length > TOUCH_MOVE_THRESHOLD.length
                    ? TOUCH_MOVE_THRESHOLD[TOUCH_MOVE_THRESHOLD.length - 1]
                    : TOUCH_MOVE_THRESHOLD[ongoingTouches.current.length - 1];

                if (dist > threshold || e.timeStamp - startTimeStamp.current >= TOUCH_TIMEOUT) {
                    moved.current = true;
                }
            }

            // Calculate delta with acceleration
            const dx = touch.pageX - tracked.pageX;
            const dy = touch.pageY - tracked.pageY;
            const timeDelta = e.timeStamp - tracked.timeStamp;

            if (timeDelta > 0) {
                const speedX = Math.abs(dx) / timeDelta * 1000;
                const speedY = Math.abs(dy) / timeDelta * 1000;
                sumX += dx * calculateAccelerationMult(speedX);
                sumY += dy * calculateAccelerationMult(speedY);
            }

            // Update tracked position
            tracked.pageX = touch.pageX;
            tracked.pageY = touch.pageY;
            tracked.timeStamp = e.timeStamp;
        }

        // Send movement if we've moved and not in timeout period
        if (moved.current && e.timeStamp - lastEndTimeStamp.current >= TOUCH_TIMEOUT) {
            if (!scrollMode && ongoingTouches.current.length === 2) {
                const dist = getTouchDistance(ongoingTouches.current[0], ongoingTouches.current[1]);
                const delta = lastPinchDist.current !== null ? dist - lastPinchDist.current : 0;
                if (pinching.current || Math.abs(delta) > PINCH_THRESHOLD) {
                    pinching.current = true;
                    lastPinchDist.current = dist;
                    send({ type: 'zoom', delta: delta * sensitivity });
                } else {
                    lastPinchDist.current = dist;
                    send({ type: 'scroll', dx: -sumX * sensitivity, dy: -sumY * sensitivity });
                }
            } else if (scrollMode) {
                // Scroll mode: single finger scrolls, or two-finger scroll in cursor mode
                send({ type: 'scroll', dx: -sumX * sensitivity, dy: -sumY * sensitivity });
            } else if (ongoingTouches.current.length === 1 || dragging.current) {
                // Cursor movement (only in cursor mode with 1 finger, or when dragging)
                send({ type: 'move', dx: sumX * sensitivity, dy: sumY * sensitivity });
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {

        const touches = e.changedTouches;

        for (let i = 0; i < touches.length; i++) {
            const idx = findTouchIndex(touches[i].identifier);
            if (idx >= 0) {
                ongoingTouches.current.splice(idx, 1);
                releasedCount.current += 1;
            }
        }

        lastEndTimeStamp.current = e.timeStamp;

        if (ongoingTouches.current.length < 2) {
            lastPinchDist.current = null;
            pinching.current = false;
        }

        // Mark as moved if too many fingers
        if (releasedCount.current > TOUCH_MOVE_THRESHOLD.length) {
            moved.current = true;
        }

        // All fingers lifted
        if (ongoingTouches.current.length === 0 && releasedCount.current >= 1) {
            setIsTracking(false);

            // Release drag if active
            if (dragging.current) {
                dragging.current = false;
                send({ type: 'click', button: 'left', press: false });
            }

            // Handle tap/click if not moved and within timeout
            if (!moved.current && e.timeStamp - startTimeStamp.current < TOUCH_TIMEOUT) {
                let button: 'left' | 'right' | 'middle' | null = null;

                if (releasedCount.current === 1) {
                    button = 'left';
                } else if (releasedCount.current === 2) {
                    button = 'right';
                } else if (releasedCount.current === 3) {
                    button = 'middle';
                }

                if (button) {
                    send({ type: 'click', button, press: true });

                    // For left click, set up drag timeout
                    if (button === 'left') {
                        draggingTimeout.current = setTimeout(handleDraggingTimeout, TOUCH_TIMEOUT);
                    } else {
                        send({ type: 'click', button, press: false });
                    }
                }
            }

            releasedCount.current = 0;
        }
    };

    return {
        isTracking,
        handlers: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd
        }
    };
};
