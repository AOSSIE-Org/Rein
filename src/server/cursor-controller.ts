import { mouse, Point } from '@nut-tree-fork/nut-js';
import { getYdotoolHandler } from './ydotool-cursor-handler';

/**
 * Result of a cursor movement operation
 */
export interface MoveCursorResult {
    success: boolean;
    method: 'nut.js' | 'ydotool' | 'none';
    message: string;
}

/**
 * System status information
 */
export interface SystemStatus {
    nutJsAvailable: boolean;
    ydotoolFallbackAvailable: boolean;
    ydotoolMessage: string;
    activeMethod: string;
}

/**
 * Cursor Controller - Manages cursor movement with fallback support
 */
export class CursorController {
    private ydotoolHandler = getYdotoolHandler();
    private lastErrorTime = 0;
    private consecutiveErrors = 0;
    private readonly MAX_CONSECUTIVE_ERRORS = 5;
    private readonly ERROR_COOLDOWN_MS = 1000;

    /**
     * Move cursor to absolute position
     * Tries nut.js first, falls back to ydotool on Linux if nut.js fails
     * 
     * @param x - Target X coordinate
     * @param y - Target Y coordinate
     * @returns Result with success status and method used
     */
    async moveToAbsolute(x: number, y: number): Promise<MoveCursorResult> {
        try {
            // Validate coordinates
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                console.warn('[CursorController] Invalid coordinates:', { x, y });
                return {
                    success: false,
                    method: 'none',
                    message: `Invalid coordinates: (${x}, ${y})`,
                };
            }

            // Round to integers
            const roundedX = Math.round(x);
            const roundedY = Math.round(y);

            try {
                // Primary method: nut.js (cross-platform)
                const point = new Point(roundedX, roundedY);
                await mouse.setPosition(point);
                
                // Reset error tracking on success
                this.consecutiveErrors = 0;
                this.lastErrorTime = 0;

                return {
                    success: true,
                    method: 'nut.js',
                    message: `Cursor moved to (${roundedX}, ${roundedY})`,
                };
            } catch (nutError) {
                // nut.js failed, try fallback
                return await this.tryYdotoolFallback(roundedX, roundedY, nutError);
            }
        } catch (error) {
            console.error('[CursorController] Unexpected error in moveToAbsolute:', error);
            return {
                success: false,
                method: 'none',
                message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Try ydotool as fallback when nut.js fails
     */
    private async tryYdotoolFallback(
        x: number,
        y: number,
        nutError: unknown
    ): Promise<MoveCursorResult> {
        // Check if we're in an error cooldown period
        const now = Date.now();
        if (now - this.lastErrorTime < this.ERROR_COOLDOWN_MS) {
            return {
                success: false,
                method: 'none',
                message: 'Error cooldown active, skipping fallback attempt',
            };
        }

        // Check if we've exceeded max consecutive errors
        if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            console.warn('[CursorController] Too many consecutive errors, giving up fallback');
            return {
                success: false,
                method: 'none',
                message: 'Too many consecutive errors',
            };
        }

        try {
            // Log the nut.js error for debugging
            if (nutError instanceof Error) {
                console.warn('[CursorController] nut.js failed:', nutError.message);
            } else {
                console.warn('[CursorController] nut.js failed with unknown error');
            }

            // Check if ydotool is available
            if (!this.ydotoolHandler.isAvailable()) {
                this.consecutiveErrors++;
                this.lastErrorTime = now;
                return {
                    success: false,
                    method: 'none',
                    message: 'ydotool not available as fallback',
                };
            }

            // Try ydotool
            const success = this.ydotoolHandler.moveCursorAbsolute(x, y);
            
            if (success) {
                // Reset error tracking on fallback success
                this.consecutiveErrors = 0;
                this.lastErrorTime = 0;

                return {
                    success: true,
                    method: 'ydotool',
                    message: `Cursor moved to (${x}, ${y}) [ydotool fallback]`,
                };
            } else {
                this.consecutiveErrors++;
                this.lastErrorTime = now;
                return {
                    success: false,
                    method: 'none',
                    message: `Failed to move cursor with both nut.js and ydotool to (${x}, ${y})`,
                };
            }
        } catch (fallbackError) {
            this.consecutiveErrors++;
            this.lastErrorTime = now;
            console.error('[CursorController] Fallback error:', fallbackError);
            return {
                success: false,
                method: 'none',
                message: `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Get current cursor position
     * Uses nut.js only (ydotool doesn't provide position queries)
     * 
     * @returns Current cursor position or null if unavailable
     */
    async getCurrentPosition(): Promise<{ x: number; y: number } | null> {
        try {
            const pos = await mouse.getPosition();
            return { x: pos.x, y: pos.y };
        } catch (error) {
            console.warn('[CursorController] Failed to get cursor position:', error);
            return null;
        }
    }

    /**
     * Get system status information
     */
    getStatus(): SystemStatus {
        const ydotoolStatus = this.ydotoolHandler.getStatus();

        return {
            nutJsAvailable: true, // Always available as it's a dependency
            ydotoolFallbackAvailable: ydotoolStatus.available,
            ydotoolMessage: ydotoolStatus.message,
            activeMethod: ydotoolStatus.available
                ? 'nut.js (with ydotool fallback)'
                : 'nut.js only',
        };
    }

    /**
     * Reset error tracking (useful for recovery)
     */
    resetErrorTracking(): void {
        this.consecutiveErrors = 0;
        this.lastErrorTime = 0;
    }
}

/**
 * Singleton instance management
 */
let cursorControllerInstance: CursorController | null = null;

/**
 * Get or create the singleton cursor controller instance
 */
export function getCursorController(): CursorController {
    if (!cursorControllerInstance) {
        cursorControllerInstance = new CursorController();
    }
    return cursorControllerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCursorController(): void {
    cursorControllerInstance = null;
}
