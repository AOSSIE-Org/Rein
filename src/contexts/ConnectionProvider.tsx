"use client"

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
	if (!context)
		throw new Error("useConnection must be used within ConnectionProvider")
	return context
}

export function ConnectionProvider({
	children,
}: { children: React.ReactNode }) {
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
				subscribersRef.current[type].delete(callback)
			}
		},
		[],
	)

	const reconnectCountRef = useRef(0)

	const connect = useCallback(() => {
		if (!isMountedRef.current) return

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const host = window.location.host
		const urlParams = new URLSearchParams(window.location.search)
		const urlToken = urlParams.get("token")

		let storedToken: string | null = null
		try {
			storedToken = localStorage.getItem("rein_auth_token")
		} catch (e) {
			// Restricted context (e.g. private mode)
		}

		const token = urlToken || storedToken

		if (urlToken && urlToken !== storedToken) {
			try {
				localStorage.setItem("rein_auth_token", urlToken)
			} catch (e) {
				// Failed to store
			}
		}

		let wsUrl = `${protocol}//${host}/ws`
		if (token) {
			wsUrl += `?token=${encodeURIComponent(token)}`
		}

		if (wsRef.current) {
			wsRef.current.onopen = null
			wsRef.current.onclose = null
			wsRef.current.onerror = null
			wsRef.current.close()
		}

		setStatus("connecting")
		const socket = new WebSocket(wsUrl)

		socket.onopen = () => {
			if (isMountedRef.current) {
				setStatus("connected")
				reconnectCountRef.current = 0 // Reset on successful connect
			}
		}

		socket.onmessage = (event) => {
			if (!isMountedRef.current) return

			// Handle binary data separately (frames)
			if (event.data instanceof Blob) {
				// Relayed directly via internal listeners in hooks
				return
			}

			try {
				const msg = JSON.parse(event.data)
				if (msg.type === "connected") {
					setPlatform(msg.platform || null)
				}
				const typeSubscribers = subscribersRef.current[msg.type]
				if (typeSubscribers) {
					for (const callback of typeSubscribers) {
						callback(msg)
					}
				}
			} catch (e) {
				// Not JSON or silent error
			}
		}

		socket.onclose = () => {
			if (isMountedRef.current) {
				setStatus("disconnected")
				// Exponential Backoff
				const delay = Math.min(
					1000 * 2 ** reconnectCountRef.current,
					30000, // Max 30s
				)
				reconnectCountRef.current += 1
				setTimeout(connect, delay)
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
