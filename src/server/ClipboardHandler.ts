import clipboardy from 'clipboardy';
import logger from '../utils/logger';

// Hard cap so nobody tries to shove a whole file through the clipboard channel
const MAX_TEXT_LENGTH = 10_000;

/**
 * Reads the current system clipboard text.
 * Returns empty string if the clipboard is empty or something goes wrong.
 */
export async function readClipboard(): Promise<string> {
    try {
        const text = await clipboardy.read();
        return text || '';
    } catch (err: any) {
        logger.error(`Clipboard read failed: ${err?.message || err}`);
        return '';
    }
}

/**
 * Writes text to the system clipboard.
 * Truncates silently if it exceeds the length cap — better than crashing.
 */
export async function writeClipboard(text: string): Promise<boolean> {
    try {
        const sanitized = text.slice(0, MAX_TEXT_LENGTH);
        await clipboardy.write(sanitized);
        return true;
    } catch (err: any) {
        logger.error(`Clipboard write failed: ${err?.message || err}`);
        return false;
    }
}
