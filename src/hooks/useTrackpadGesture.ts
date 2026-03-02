import { useRef, useState } from "react";
import {
  PINCH_THRESHOLD,
  TOUCH_MOVE_THRESHOLD,
  TOUCH_TIMEOUT,
  calculateAccelerationMult,
} from "../utils/math";

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

const SCROLL_SENSITIVITY_RATIO = 0.45;

export const useTrackpadGesture = (
  send: (msg: unknown) => void,
  scrollMode: boolean,
  cursorSensitivity = 1.5,
  invertScroll = false,
  axisThreshold = 2.5,
) => {
  const scrollSensitivity = cursorSensitivity * SCROLL_SENSITIVITY_RATIO;
  const [isTracking, setIsTracking] = useState(false);

  // Refs for tracking state (avoids re-renders during rapid movement)
  const ongoingTouches = useRef<TrackedTouch[]>([]);
  const moved = useRef(false);
  const startTimeStamp = useRef(0);
  const releasedCount = useRef(0);
  const dragging = useRef(false);
  const draggingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const initialPinchStartDist = useRef<number | null>(null);
  const pinching = useRef(false);

  // Subpixel positional tracking mapping precisely to integer pixel grids sent over WS
  const absoluteCursor = useRef({ x: 0, y: 0 });
  const lastSentRounded = useRef({ x: 0, y: 0 });

  const absoluteScroll = useRef({ x: 0, y: 0 });
  const lastSentScrollRounded = useRef({ x: 0, y: 0 });

  // Helpers
  const findTouchIndex = (id: number) =>
    ongoingTouches.current.findIndex((t) => t.identifier === id);

  const emitQuantizedMove = (
    type: "move" | "scroll",
    absRef: { current: { x: number; y: number } },
    lastRef: { current: { x: number; y: number } },
  ) => {
    const absX = Math.round(absRef.current.x);
    const absY = Math.round(absRef.current.y);

    const dx = absX - lastRef.current.x;
    const dy = absY - lastRef.current.y;

    if (dx !== 0 || dy !== 0) {
      lastRef.current.x = absX;
      lastRef.current.y = absY;
      send({ type, dx, dy });
    }
  };

  const processMovement = (sumX: number, sumY: number) => {
    const invertMult = invertScroll ? -1 : 1;

    if (dragging.current || ongoingTouches.current.length === 1) {
      const rawDx = sumX * cursorSensitivity;
      const rawDy = sumY * cursorSensitivity;

      // Accumulate absolute subpixels smoothly over consecutive movement loops
      absoluteCursor.current.x += rawDx;
      absoluteCursor.current.y += rawDy;

      emitQuantizedMove("move", absoluteCursor, lastSentRounded);
      return;
    }

    if (!scrollMode && ongoingTouches.current.length === 2) {
      const dist = getTouchDistance(
        ongoingTouches.current[0],
        ongoingTouches.current[1],
      );

      if (pinching.current) {
        // Already activated — use per-frame delta for zoom magnitude
        const frameDelta =
          lastPinchDist.current !== null ? dist - lastPinchDist.current : 0;
        lastPinchDist.current = dist;
        send({
          type: "zoom",
          delta: frameDelta * scrollSensitivity * invertMult,
        });
      } else {
        // Not yet activated — check cumulative distance from gesture start
        const cumulativeDelta =
          initialPinchStartDist.current !== null
            ? dist - initialPinchStartDist.current
            : 0;
        if (Math.abs(cumulativeDelta) > PINCH_THRESHOLD) {
          // Threshold crossed — activate and emit the full cumulative zoom
          pinching.current = true;
          lastPinchDist.current = dist;
          send({
            type: "zoom",
            delta: cumulativeDelta * scrollSensitivity * invertMult,
          });
        } else {
          // Below threshold — treat as scroll, do NOT update lastPinchDist
          const rawDx = -sumX * scrollSensitivity * invertMult;
          const rawDy = -sumY * scrollSensitivity * invertMult;

          absoluteScroll.current.x += rawDx;
          absoluteScroll.current.y += rawDy;

          emitQuantizedMove("scroll", absoluteScroll, lastSentScrollRounded);
        }
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

      const rawDx = -scrollDx * scrollSensitivity * invertMult;
      const rawDy = -scrollDy * scrollSensitivity * invertMult;

      absoluteScroll.current.x += rawDx;
      absoluteScroll.current.y += rawDy;

      emitQuantizedMove("scroll", absoluteScroll, lastSentScrollRounded);
    }
  };

  const handleDraggingTimeout = () => {
    draggingTimeout.current = null;
    send({ type: "click", button: "left", press: false });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Start absolute positions cleanly from 0, representing start of single gesture delta
    absoluteCursor.current = { x: 0, y: 0 };
    lastSentRounded.current = { x: 0, y: 0 };
    absoluteScroll.current = { x: 0, y: 0 };
    lastSentScrollRounded.current = { x: 0, y: 0 };

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
      // Exactly 2 fingers — seed fresh pinch baseline
      const startDist = getTouchDistance(
        ongoingTouches.current[0],
        ongoingTouches.current[1],
      );
      lastPinchDist.current = startDist;
      initialPinchStartDist.current = startDist;
      pinching.current = false;
    } else {
      // 1, 3+ fingers — clear stale pinch state to prevent jump on next 2-touch
      lastPinchDist.current = null;
      initialPinchStartDist.current = null;
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
          (touch.pageX - tracked.pageXStart) ** 2 +
            (touch.pageY - tracked.pageYStart) ** 2,
        );
        const threshold =
          ongoingTouches.current.length > TOUCH_MOVE_THRESHOLD.length
            ? TOUCH_MOVE_THRESHOLD[TOUCH_MOVE_THRESHOLD.length - 1]
            : TOUCH_MOVE_THRESHOLD[ongoingTouches.current.length - 1];

        if (
          dist > threshold ||
          e.timeStamp - startTimeStamp.current >= TOUCH_TIMEOUT
        ) {
          moved.current = true;
        }
      }

      // Calculate delta with acceleration
      const dx = touch.pageX - tracked.pageX;
      const dy = touch.pageY - tracked.pageY;
      const timeDelta = e.timeStamp - tracked.timeStamp;

      if (timeDelta > 0) {
        const speedX = (Math.abs(dx) / timeDelta) * 1000;
        const speedY = (Math.abs(dy) / timeDelta) * 1000;
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

    if (ongoingTouches.current.length === 2) {
      // Reseed when returning to exactly 2 touches (e.g. 3 → 2)
      const startDist = getTouchDistance(
        ongoingTouches.current[0],
        ongoingTouches.current[1],
      );
      lastPinchDist.current = startDist;
      initialPinchStartDist.current = startDist;
      pinching.current = false;
    } else {
      // 0, 1, or 3+ touches — clear all pinch state
      lastPinchDist.current = null;
      initialPinchStartDist.current = null;
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
        send({ type: "click", button: "left", press: false });
      }

      // Handle tap/click if not moved and within timeout
      if (
        !moved.current &&
        e.timeStamp - startTimeStamp.current < TOUCH_TIMEOUT
      ) {
        let button: "left" | "right" | "middle" | null = null;

        if (releasedCount.current === 1) {
          button = "left";
        } else if (releasedCount.current === 2) {
          button = "right";
        } else if (releasedCount.current === 3) {
          button = "middle";
        }

        if (button) {
          send({ type: "click", button, press: true });

          // For left click, set up drag timeout
          if (button === "left") {
            draggingTimeout.current = setTimeout(
              handleDraggingTimeout,
              TOUCH_TIMEOUT,
            );
          } else {
            send({ type: "click", button, press: false });
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
      onTouchEnd: handleTouchEnd,
    },
  };
};
