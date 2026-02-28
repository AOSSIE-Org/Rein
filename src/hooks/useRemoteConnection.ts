"use client"

import { useRef, useEffect, useCallback } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { wsRef, status, platform, send, subscribe } = useConnection()

	// In-memory clipboard — the single source of truth for copy/paste
	const clipboardRef = useRef<string | null>(null)

	useEffect(() => {
		const unsubscribe = subscribe("clipboard-sync", (msg: unknown) => {
			const m = msg as { type: string; text: string }
			if (typeof m.text !== "string") return

			const text = m.text
			clipboardRef.current = text

			// Try writing to mobile browser clipboard (works on HTTPS or localhost)
			if (navigator?.clipboard?.writeText) {
				navigator.clipboard.writeText(text).catch(() => {
					// HTTP — silently ignore, clipboardRef is the fallback
				})
			}
		})
		return unsubscribe
	}, [subscribe])

	const sendCombo = useCallback(
		(keys: string[]) => send({ type: "combo", keys }),
		[send],
	)

	/**
	 * COPY:
	 * Ask server to read whatever text is currently in its clipboard
	 * (user already pressed Ctrl+C on laptop).
	 * Server responds with { type: "clipboard-sync", text }.
	 */
	const sendCopy = useCallback(() => {
		send({ type: "copy" })
	}, [send])

	/**
	 * PASTE:
	 * Send stored clipboard text to server so it types it on the laptop.
	 * 1. clipboardRef (synced from server) — reliable on HTTP
	 * 2. navigator.clipboard.readText()   — HTTPS/localhost only
	 * 3. server Ctrl+V fallback
	 */
	const sendPaste = useCallback(async () => {
		if (clipboardRef.current) {
			send({ type: "text", text: clipboardRef.current })
			return
		}

		if (navigator?.clipboard?.readText) {
			try {
				const text = await navigator.clipboard.readText()
				if (text) {
					send({ type: "text", text })
					return
				}
			} catch {
				// fall through
			}
		}

		send({ type: "paste" })
	}, [send])

	/** Expose ref so UI can show what's in the clipboard if needed */
	const getClipboard = useCallback(() => clipboardRef.current, [])

	return {
		status,
		platform,
		send,
		sendCombo,
		sendCopy,
		sendPaste,
		getClipboard,
		wsRef,
		subscribe,
	}
}
