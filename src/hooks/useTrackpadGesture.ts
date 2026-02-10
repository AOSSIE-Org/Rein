import { useState, useRef } from 'react';
import { useGesture } from '@use-gesture/react';

const MOVE_MULTIPLIER = 1.2;
const SCROLL_MULTIPLIER = 3.0;

const TAP_TIME = 200;
const TAP_MOVE_THRESHOLD = 6;

export const useTrackpadGesture = (
    send: (msg: any) => void,
    scrollMode: boolean
) => {
    const [isTracking, setIsTracking] = useState(false);

    const startTimeRef = useRef(0);
    const movedRef = useRef(false);
    const touchCountRef = useRef(1);

    const bind = useGesture(
        {
            onPointerDown: () => {
                startTimeRef.current = Date.now();
                movedRef.current = false;
                setIsTracking(true);
            },

            onDrag: ({ delta, touches }) => {
                const [dx, dy] = delta;
                touchCountRef.current = touches;

                if (
                    Math.abs(dx) > TAP_MOVE_THRESHOLD ||
                    Math.abs(dy) > TAP_MOVE_THRESHOLD
                ) {
                    movedRef.current = true;
                }

                if (touches === 2 || scrollMode) {
                    send({
                        type: 'scroll',
                        dx: dx * SCROLL_MULTIPLIER,
                        dy: dy * SCROLL_MULTIPLIER
                    });
                } else {
                    send({
                        type: 'move',
                        dx: dx * MOVE_MULTIPLIER,
                        dy: dy * MOVE_MULTIPLIER
                    });
                }
            },

            onPointerUp: () => {
                setIsTracking(false);
                const duration = Date.now() - startTimeRef.current;

                if (!movedRef.current && duration <= TAP_TIME) {
                    const button =
                        touchCountRef.current === 2 ? 'right' : 'left';

                    send({ type: 'click', button, press: true });
                    setTimeout(
                        () =>
                            send({
                                type: 'click',
                                button,
                                press: false
                            }),
                        40
                    );
                }
            }
        },
        {
            drag: {
                pointer: { touch: true },
                threshold: 0
            }
        }
    );

    return { handlers: bind(), isTracking };
};
