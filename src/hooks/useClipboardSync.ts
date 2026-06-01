/**
 * useClipboardSync — PoC hook for bidirectional clipboard sync (Issue #97)
 *
 * Problem: navigator.clipboard.writeText() requires HTTPS, which TanStack
 * Router doesn't support yet (https://github.com/TanStack/router/issues/4287).
 *
 * Solution: Use the WebSocket channel to relay clipboard text between the
 * phone client and the desktop server without requiring HTTPS on the client.
 *
 * Flow:
 *   COPY  → client reads its own clipboard → sends {type:"clipboard-push", text}
 *           → server calls keyboard.pressKey(Ctrl+C) then writes text to host clipboard
 *   PASTE → client sends {type:"clipboard-pull"}
 *           → server reads host clipboard → responds {type:"clipboard-text", text}
 *           → client writes text into active input via document.execCommand('insertText')
 *             (works over plain HTTP, no HTTPS required)
 */

import { useCallback, useEffect, useRef } from "react"

export interface ClipboardSyncOptions {
	/** Live WebSocket connection to the Rein server */
	socket: WebSocket | null
	/** Called when a paste payload arrives from the server */
	onPasteReceived?: (text: string) => void
}

export function useClipboardSync({
	socket,
	onPasteReceived,
}: ClipboardSyncOptions) {
	const onPasteRef = useRef(onPasteReceived)
	useEffect(() => {
		onPasteRef.current = onPasteReceived
	}, [onPasteReceived])

	// Listen for clipboard-text messages arriving from the server
	useEffect(() => {
		if (!socket) return

		const handler = (event: MessageEvent) => {
			try {
				const msg = JSON.parse(event.data as string) as {
					type: string
					text?: string
				}
				if (msg.type === "clipboard-text" && typeof msg.text === "string") {
					// Try modern clipboard API first (only works over HTTPS / localhost)
					if (navigator.clipboard && window.isSecureContext) {
						navigator.clipboard.writeText(msg.text).catch(() => {
							insertTextFallback(msg.text)
						})
					} else {
						// Fallback: insert into focused element via execCommand (HTTP-safe)
						insertTextFallback(msg.text)
					}
					onPasteRef.current?.(msg.text)
				}
			} catch {
				// Not a JSON message — ignore
			}
		}

		socket.addEventListener("message", handler)
		return () => socket.removeEventListener("message", handler)
	}, [socket])

	/**
	 * pushCopy — reads the client clipboard and sends it to the server so the
	 * host clipboard is updated and Ctrl+C is emitted on the focused element.
	 */
	const pushCopy = useCallback(async () => {
		if (!socket || socket.readyState !== WebSocket.OPEN) return

		let text = ""
		try {
			if (navigator.clipboard && window.isSecureContext) {
				text = await navigator.clipboard.readText()
			} else {
				// Fallback: try to read selected text from DOM
				text = window.getSelection()?.toString() ?? ""
			}
		} catch {
			text = window.getSelection()?.toString() ?? ""
		}

		socket.send(JSON.stringify({ type: "clipboard-push", text }))
	}, [socket])

	/**
	 * requestPaste — asks the server for the current host clipboard content.
	 * The server will respond with {type:"clipboard-text", text}.
	 */
	const requestPaste = useCallback(() => {
		if (!socket || socket.readyState !== WebSocket.OPEN) return
		socket.send(JSON.stringify({ type: "clipboard-pull" }))
	}, [socket])

	return { pushCopy, requestPaste }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * HTTP-safe text insertion — uses the deprecated but universally supported
 * execCommand('insertText') which works without HTTPS.
 */
function insertTextFallback(text: string): void {
	const active = document.activeElement as
		| HTMLInputElement
		| HTMLTextAreaElement
		| null
	if (active && "value" in active) {
		const start = active.selectionStart ?? active.value.length
		const end = active.selectionEnd ?? active.value.length
		active.value = active.value.slice(0, start) + text + active.value.slice(end)
		active.selectionStart = active.selectionEnd = start + text.length
		active.dispatchEvent(new Event("input", { bubbles: true }))
	} else {
		// Last resort: execCommand (works in most browsers even on HTTP)
		document.execCommand("insertText", false, text)
	}
}
