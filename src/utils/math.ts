export const TOUCH_MOVE_THRESHOLD = [10, 15, 15];
export const TOUCH_TIMEOUT = 250;
export const PINCH_THRESHOLD = 10;
export const POINTER_ACCELERATION = [
    [0, 0],
    [87, 1],
    [173, 1],
    [553, 2],
];

export const calculateAccelerationMult = (speed: number): number => {
    for (let i = 0; i < POINTER_ACCELERATION.length; i++) {
        const [s2, a2] = POINTER_ACCELERATION[i];
        if (s2 <= speed) continue;
        if (i === 0) return a2;
        const [s1, a1] = POINTER_ACCELERATION[i - 1];
        return ((speed - s1) / (s2 - s1)) * (a2 - a1) + a1;
    }
    return POINTER_ACCELERATION.length > 0
        ? POINTER_ACCELERATION[POINTER_ACCELERATION.length - 1][1]
        : 1;
};