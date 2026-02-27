import type React from "react"
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	useCallback,
} from "react"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

interface ConnectionContextType {
	wsRef: React.RefObject<WebSocket | null>
	status: ConnectionStatus
	platform: string | null
	send: (msg: unknown) => void
	subscribe: (type: string, callback: (msg: unknown) => void) => () => void
}

const ConnectionContext = createContext<ConnectionContextType | null>(null)

export const useConnection = () => {
	const context = useContext(ConnectionContext)
	if (!context) {
		throw new Error("useConnection must be used within a ConnectionProvider")
	}
	return context
}

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const wsRef = useRef<WebSocket | null>(null)
	const [status, setStatus] = useState<ConnectionStatus>("disconnected")
	const [platform, setPlatform] = useState<string | null>(null)
	const isMountedRef = useRef(true)
	const subscribersRef = useRef<Record<string, Set<(msg: unknown) => void>>>({})

	const subscribe = useCallback(
		(type: string, callback: (msg: unknown) => void) => {
			if (!subscribersRef.current[type]) {
				subscribersRef.current[type] = new Set()
			}
			subscribersRef.current[type].add(callback)
			return () => {
				subscribersRef.current[type]?.delete(callback)
			}
		},
		[],
	)

	const connect = useCallback(() => {
		if (!isMountedRef.current) return

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const host = window.location.host

		// Get token from URL params (passed via QR code) or localStorage
		const urlParams = new URLSearchParams(window.location.search)
		const urlToken = urlParams.get("token")
		const storedToken = localStorage.getItem("rein_auth_token")
		const token = urlToken || storedToken

		// Persist URL token to localStorage
		if (urlToken && urlToken !== storedToken) {
			localStorage.setItem("rein_auth_token", urlToken)
		}

		let wsUrl = `${protocol}//${host}/ws`
		if (token) {
			wsUrl += `?token=${encodeURIComponent(token)}`
		}

		// Close any existing socket
		if (wsRef.current) {
			wsRef.current.onopen = null
			wsRef.current.onclose = null
			wsRef.current.onerror = null
			wsRef.current.close()
			wsRef.current = null
		}

		setStatus("connecting")
		const socket = new WebSocket(wsUrl)

		socket.onopen = () => {
			if (isMountedRef.current) setStatus("connected")
		}

		socket.onmessage = (event) => {
			if (!isMountedRef.current || typeof event.data !== "string") return
			try {
				const msg = JSON.parse(event.data)

				// Route to subscribers
				if (msg.type && subscribersRef.current[msg.type]) {
					for (const cb of subscribersRef.current[msg.type]) {
						cb(msg)
					}
				}

				if (msg.type === "connected") {
					setPlatform(msg.platform || null)
				}
			} catch (e) {
				// Messages handled by other hooks (e.g. signaling)
			}
		}

		socket.onclose = () => {
			if (isMountedRef.current) {
				setStatus("disconnected")
				setPlatform(null)
				// Attempt reconnection
				setTimeout(connect, 3000)
			}
		}

		socket.onerror = () => {
			socket.close()
		}

		wsRef.current = socket
	}, [])

	useEffect(() => {
		isMountedRef.current = true
		connect()

		return () => {
			isMountedRef.current = false
			if (wsRef.current) {
				wsRef.current.onopen = null
				wsRef.current.onclose = null
				wsRef.current.onerror = null
				wsRef.current.close()
				wsRef.current = null
			}
		}
	}, [connect])

	const send = useCallback((msg: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg))
		}
	}, [])

	return (
		<ConnectionContext.Provider
			value={{ wsRef, status, platform, send, subscribe }}
		>
			{children}
		</ConnectionContext.Provider>
	)
}
