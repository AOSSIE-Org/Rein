import { useRef, useState } from 'react';
import { createUseGesture, dragAction, pinchAction } from '@use-gesture/react';

const useGesture = createUseGesture([dragAction, pinchAction]);

export const useTrackpadGesture = (
    send: (msg: any) => void,
    scrollMode: boolean,
    sensitivity: number = 1.5
) => {
    const [isTracking, setIsTracking] = useState(false);
    const maxFingers = useRef(0);

    const bind = useGesture(
        {
            onDragStart: ({ touches }) => {
                maxFingers.current = touches;
                setIsTracking(true);
            },

            onDrag: ({ delta: [dx, dy], tap, touches }) => {
                if (tap) return;

                if (touches > maxFingers.current) {
                    maxFingers.current = touches;
                }

                const scaledDx = dx * sensitivity;
                const scaledDy = dy * sensitivity;

                const isScroll =
                    maxFingers.current === 2 ||
                    (scrollMode && maxFingers.current === 1);

                if (isScroll) {
                    send({
                        type: 'scroll',
                        dx: -scaledDx,
                        dy: -scaledDy,
                    });
                } else if (maxFingers.current === 1) {
                    send({
                        type: 'move',
                        dx: scaledDx,
                        dy: scaledDy,
                    });
                }
            },

            onPinchStart: () => {
                setIsTracking(true);
            },

            onPinch: ({ delta: [d], touches }) => {
                if (touches === 2 && d !== 0) {
                    send({
                        type: 'zoom',
                        delta: d * sensitivity,
                    });
                }
            },

            onDragEnd: ({ tap }) => {
                if (tap) {
                    let button: 'left' | 'right' | 'middle' | null = null;

                    if (maxFingers.current === 1) button = 'left';
                    else if (maxFingers.current === 2) button = 'right';
                    else if (maxFingers.current === 3) button = 'middle';

                    if (button) {
                        send({ type: 'click', button, press: true });
                        setTimeout(() => {
                            send({ type: 'click', button, press: false });
                        }, 50);
                    }
                }

                maxFingers.current = 0;
                setIsTracking(false);
            },

            onPinchEnd: () => {
                setIsTracking(false);
            },
        },
        {
            drag: {
                threshold: 5,
                filterTaps: true,
            },
            pinch: {
                scaleBounds: { min: 0.1, max: 10 },
            },
            eventOptions: {
                passive: false,
            },
        }
    );

    return {
        isTracking,
        handlers: bind(),
    };
};
