import { execSync, spawnSync } from 'child_process';
import { platform } from 'os';

/**
 * Status information for the ydotool handler
 */
export interface YdotoolStatus {
    available: boolean;
    isLinux: boolean;
    message: string;
}

/**
 * Ydotool Cursor Handler
 * Manages cursor movement via ydotool on Linux systems
 */
export class YdotoolCursorHandler {
    private available: boolean = false;
    private isLinux: boolean = false;
    private initialized: boolean = false;

    constructor() {
        this.initialize();
    }

    /**
     * Initialize the handler
     * Checks if ydotool is available on the system
     */
    private initialize(): void {
        if (this.initialized) {
            return;
        }

        try {
            this.isLinux = platform() === 'linux';
            
            if (!this.isLinux) {
                this.available = false;
                this.initialized = true;
                return;
            }

            // Check if ydotool binary exists
            try {
                execSync('which ydotool', { stdio: 'ignore' });
            } catch {
                this.available = false;
                this.initialized = true;
                return;
            }

            // Check if ydotoold daemon is responsive
            try {
                spawnSync('ydotool', ['--help'], {
                    stdio: 'ignore',
                    timeout: 2000,
                });
                this.available = true;
            } catch {
                this.available = false;
            }

            this.initialized = true;
        } catch (error) {
            this.available = false;
            this.initialized = true;
        }
    }

    /**
     * Check if ydotool is available
     */
    public isAvailable(): boolean {
        if (!this.initialized) {
            this.initialize();
        }
        return this.available;
    }

    /**
     * Move cursor to absolute position (x, y)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if successful, false otherwise
     */
    public moveCursorAbsolute(x: number, y: number): boolean {
        if (!this.available) {
            return false;
        }

        try {
            // Validate coordinates
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                console.warn('[ydotool] Invalid coordinates:', { x, y });
                return false;
            }

            // Round coordinates to integers
            const roundedX = Math.round(x);
            const roundedY = Math.round(y);

            // Spawn ydotool process
            const result = spawnSync('ydotool', ['mousemove', String(roundedX), String(roundedY)], {
                stdio: 'pipe',
                timeout: 5000,
                encoding: 'utf8',
            });

            if (result.error) {
                console.warn(`[ydotool] Failed to move cursor to (${roundedX}, ${roundedY}):`, result.error.message);
                return false;
            }

            if (result.status !== 0) {
                console.warn(`[ydotool] Command failed with status ${result.status}`);
                return false;
            }

            return true;
        } catch (error) {
            console.warn(`[ydotool] Exception during absolute movement:`, error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Move cursor relative to current position
     * @param dx - Relative X movement
     * @param dy - Relative Y movement
     * @returns true if successful, false otherwise
     */
    public moveCursorRelative(dx: number, dy: number): boolean {
        if (!this.available) {
            return false;
        }

        try {
            // Validate coordinates
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
                console.warn('[ydotool] Invalid relative coordinates:', { dx, dy });
                return false;
            }

            // Round coordinates to integers
            const roundedDx = Math.round(dx);
            const roundedDy = Math.round(dy);

            // Spawn ydotool process
            const result = spawnSync('ydotool', ['mousemove', '--relative', String(roundedDx), String(roundedDy)], {
                stdio: 'pipe',
                timeout: 5000,
                encoding: 'utf8',
            });

            if (result.error) {
                console.warn(`[ydotool] Failed to move cursor relative (${roundedDx}, ${roundedDy}):`, result.error.message);
                return false;
            }

            if (result.status !== 0) {
                console.warn(`[ydotool] Relative command failed with status ${result.status}`);
                return false;
            }

            return true;
        } catch (error) {
            console.warn(`[ydotool] Exception during relative movement:`, error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Get information about ydotool status
     */
    public getStatus(): YdotoolStatus {
        if (!this.initialized) {
            this.initialize();
        }

        if (!this.isLinux) {
            return {
                available: false,
                isLinux: false,
                message: 'ydotool is Linux-only',
            };
        }

        if (!this.available) {
            return {
                available: false,
                isLinux: true,
                message: 'ydotool not available - install with: sudo apt install ydotool (or your package manager)',
            };
        }

        return {
            available: true,
            isLinux: true,
            message: 'ydotool ready for cursor movement',
        };
    }
}

// Singleton instance
let handlerInstance: YdotoolCursorHandler | null = null;

/**
 * Get or create the singleton ydotool handler instance
 */
export function getYdotoolHandler(): YdotoolCursorHandler {
    if (!handlerInstance) {
        handlerInstance = new YdotoolCursorHandler();
    }
    return handlerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetYdotoolHandler(): void {
    handlerInstance = null;
}
