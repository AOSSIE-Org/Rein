import { useCallback, useEffect, useRef, useState } from "react"

export const useRemoteConnection = () => {
	const wsRef = useRef<WebSocket | null>(null)
	const [status, setStatus] = useState<
		"connecting" | "connected" | "disconnected" | "waiting-approval"
	>("disconnected")
	const [pairingRequestId, setPairingRequestId] = useState<string | null>(null)

	useEffect(() => {
		let isMounted = true
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const host = window.location.host

		// Get token from URL params (passed via QR code) or localStorage
		const urlParams = new URLSearchParams(window.location.search)
		const urlToken = urlParams.get("token")
		const storedToken = localStorage.getItem("rein_auth_token")
		const token = urlToken || storedToken

		// Persist URL token to localStorage for future reconnections
		if (urlToken && urlToken !== storedToken) {
			localStorage.setItem("rein_auth_token", urlToken)
		}

		let wsUrl = `${protocol}//${host}/ws`
		if (token) {
			wsUrl += `?token=${encodeURIComponent(token)}`
		}

		let reconnectTimer: NodeJS.Timeout
		let pairingCheckTimer: NodeJS.Timeout

		const connect = () => {
			if (!isMounted) return

			// Close any existing socket before creating a new one
			if (wsRef.current) {
				wsRef.current.onopen = null
				wsRef.current.onclose = null
				wsRef.current.onerror = null
				wsRef.current.onmessage = null
				wsRef.current.close()
				wsRef.current = null
			}

			setStatus("connecting")
			const socket = new WebSocket(wsUrl)

			socket.onopen = () => {
				if (isMounted) {
					// If no token, request pairing
					if (!token && !pairingRequestId) {
						setStatus("waiting-approval")
						const deviceName =
							typeof navigator !== "undefined"
								? navigator.userAgent.split("/")[0]
								: "Unknown Device"
						socket.send(
							JSON.stringify({
								type: "request-pairing",
								deviceName,
								userAgent: navigator.userAgent,
							}),
						)
					} else {
						setStatus("connected")
					}
				}
			}

			socket.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data)
					if (
						data.type === "pairing-requested" &&
						data.requestId &&
						isMounted
					) {
						setPairingRequestId(data.requestId)
					} else if (data.type === "pairing-approved" && data.token && isMounted) {
						// Pairing was approved, save token and reconnect
						localStorage.setItem("rein_auth_token", data.token)
						setPairingRequestId(null)
						socket.close()
						// Reconnect with new token
						const newWsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(data.token)}`
						wsUrl = newWsUrl
						setTimeout(() => connect(), 500)
					} else if (data.type === "pairing-rejected" && isMounted) {
						setStatus("disconnected")
						setPairingRequestId(null)
						socket.close()
					}
				} catch {
					// Ignore parse errors
				}
			}

			socket.onclose = () => {
				if (isMounted) {
					setStatus("disconnected")
					if (!pairingRequestId) {
						// Only reconnect if not waiting for pairing approval
						reconnectTimer = setTimeout(connect, 3000)
					}
				}
			}
			socket.onerror = () => {
				socket.close()
			}

			wsRef.current = socket
		}

		// Defer to next tick so React Strict Mode's immediate unmount
		// sets isMounted=false before any socket is created
		const initialTimer = setTimeout(connect, 0)

		return () => {
			isMounted = false
			clearTimeout(initialTimer)
			clearTimeout(reconnectTimer)
			clearTimeout(pairingCheckTimer)
			if (wsRef.current) {
				// Nullify handlers to prevent cascading error/close events
				wsRef.current.onopen = null
				wsRef.current.onclose = null
				wsRef.current.onerror = null
				wsRef.current.onmessage = null
				wsRef.current.close()
				wsRef.current = null
			}
		}
	}, [])

	const send = useCallback((msg: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg))
		}
	}, [])

	const sendCombo = useCallback((msg: string[]) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: "combo",
					keys: msg,
				}),
			)
		}
	}, [])

	return { status, send, sendCombo, pairingRequestId }
}
