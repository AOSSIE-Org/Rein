/**
 * clipboard-server.ts — Server-side clipboard relay for Issue #97
 *
 * Handles two new WebSocket message types:
 *
 *   clipboard-push  { type: "clipboard-push", text: string }
 *     ← Client sends its clipboard text.  Server writes it to the host
 *       clipboard via clipboardy, then triggers Ctrl+C on the focused element
 *       so the text is "copied" at the OS level too.
 *
 *   clipboard-pull  { type: "clipboard-pull" }
 *     ← Client wants the host clipboard.  Server reads it via clipboardy and
 *       responds with { type: "clipboard-text", text: string }.
 *
 * Why clipboardy?
 *   - Works over plain HTTP (no HTTPS requirement).
 *   - Cross-platform: macOS pbpaste/pbcopy, Linux xclip/xsel/wl-paste,
 *     Windows PowerShell Get-Clipboard / Set-Clipboard.
 *   - No native module compilation required.
 *
 * Integration point: import handleClipboardMessage and call it from the
 * existing ws.on("message") handler in websocket.ts, after the input
 * message block.
 */

import { Key, keyboard } from "@nut-tree-fork/nut-js"
import os from "node:os"
import type { WebSocket } from "ws"

// ---------------------------------------------------------------------------
// Clipboard backend — thin wrapper so it's easy to swap in a native FFI
// driver later (ties naturally into Issue #130 / PR #290).
// ---------------------------------------------------------------------------

/** Reads the host clipboard.  Returns "" on failure. */
async function readHostClipboard(): Promise<string> {
	try {
		// Dynamic import keeps this optional — the dependency is only required
		// at runtime, so the rest of the server still boots if it's absent.
		const { default: clipboardy } = await import("clipboardy")
		return await clipboardy.read()
	} catch {
		return ""
	}
}

/** Writes text to the host clipboard.  No-op on failure. */
async function writeHostClipboard(text: string): Promise<void> {
	try {
		const { default: clipboardy } = await import("clipboardy")
		await clipboardy.write(text)
	} catch {
		// Silently degrade — the paste text was already sent to the client
	}
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

const modifier = os.platform() === "darwin" ? Key.LeftSuper : Key.LeftControl

export async function handleClipboardMessage(
	msg: { type: string; text?: string },
	ws: WebSocket,
): Promise<boolean> {
	// Returns true if the message was handled (caller should skip further handling)

	if (msg.type === "clipboard-push") {
		const text = typeof msg.text === "string" ? msg.text.slice(0, 4096) : ""

		// 1. Write to host clipboard so Ctrl+V works normally afterwards
		await writeHostClipboard(text)

		// 2. Emit Ctrl+C to copy the selected text on the host side as well
		//    (matches the issue description: "send Ctrl+C and client's clipboard content")
		try {
			await keyboard.pressKey(modifier, Key.C)
		} finally {
			await Promise.allSettled([
				keyboard.releaseKey(Key.C),
				keyboard.releaseKey(modifier),
			])
		}

		return true
	}

	if (msg.type === "clipboard-pull") {
		const text = await readHostClipboard()
		ws.send(JSON.stringify({ type: "clipboard-text", text }))
		return true
	}

	return false
}

// ---------------------------------------------------------------------------
// Patch for websocket.ts — insert into VALID_INPUT_TYPES and message handler
// ---------------------------------------------------------------------------
//
// In websocket.ts, add to VALID_INPUT_TYPES:
//   "clipboard-push", "clipboard-pull"
//
// And before `await inputHandler.handleMessage(...)`, add:
//
//   import { handleClipboardMessage } from "./clipboard-server"
//   ...
//   if (await handleClipboardMessage(msg, ws)) return
//
// ---------------------------------------------------------------------------
