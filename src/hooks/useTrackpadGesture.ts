import { useRef, useState } from 'react';
import { TOUCH_MOVE_THRESHOLD, TOUCH_TIMEOUT, PINCH_THRESHOLD, calculateAccelerationMult } from '../utils/math';
import type { RemoteMessage } from '@/types';

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
    send: (msg: RemoteMessage) => void,
    scrollMode: boolean,
    sensitivity: number = 1.5,
    invertScroll: boolean = false,
    axisThreshold: number = 2.5 
) => {
    const [isTracking, setIsTracking] = useState(false);
    
    // Refs for tracking state (avoids re-renders during rapid movement)
    const ongoingTouches = useRef<TrackedTouch[]>([]);
    const moved = useRef(false);
    const startTimeStamp = useRef(0);
    const releasedCount = useRef(0);
    const dragging = useRef(false);
    const draggingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPinchDist = useRef<number | null>(null);
    const pinching = useRef(false);

    // Helpers
    const findTouchIndex = (id: number) => ongoingTouches.current.findIndex(t => t.identifier === id);

    const processMovement = (sumX: number, sumY: number) => {
        if (dragging.current) {
            send({ 
                type: 'move', 
                dx: Math.round(sumX * sensitivity * 10) / 10, 
                dy: Math.round(sumY * sensitivity * 10) / 10 
            });
            return;
        }
        const invertMult = invertScroll ? -1 : 1;
        if (!scrollMode && ongoingTouches.current.length === 2) {
            const dist = getTouchDistance(ongoingTouches.current[0], ongoingTouches.current[1]);
            const delta = lastPinchDist.current !== null ? dist - lastPinchDist.current : 0;
            if (pinching.current || Math.abs(delta) > PINCH_THRESHOLD) {
                pinching.current = true;
                lastPinchDist.current = dist;
                send({ type: 'zoom', delta: delta * sensitivity * invertMult });
            } else {
                lastPinchDist.current = dist;
                send({ 
                    type: 'scroll', 
                    dx: -sumX * sensitivity * invertMult, 
                    dy: -sumY * sensitivity * invertMult 
                });
            }
        } else if (scrollMode || ongoingTouches.current.length === 2) {
            let scrollDx = sumX;
            let scrollDy = sumY;
            if (scrollMode) {
                const absDx = Math.abs(scrollDx);
                const absDy = Math.abs(scrollDy);
                if (absDx > absDy * axisThreshold) {
                    scrollDy = 0;
                } else if (absDy > absDx * axisThreshold) {
                    scrollDx = 0;
                }
            }
            send({ 
                type: 'scroll', 
                dx: Math.round(-scrollDx * sensitivity * 10 * invertMult) / 10, 
                dy: Math.round(-scrollDy * sensitivity * 10 * invertMult) / 10 
            });
        } else if (ongoingTouches.current.length === 1) {
            send({ 
                type: 'move', 
                dx: Math.round(sumX * sensitivity * 10) / 10, 
                dy: Math.round(sumY * sensitivity * 10) / 10 
            });
        }
    };

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

        // Send movement if we've moved
        if (moved.current) {
            processMovement(sumX, sumY);
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
