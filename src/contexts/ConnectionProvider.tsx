"use client"
import type React from "react"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"
import { useWebRTC } from "../hooks/useWebRTC"
type ConnectionStatus = "connecting" | "connected" | "disconnected"

interface ConnectionContextType {
	wsRef: React.RefObject<WebSocket | null>
	status: ConnectionStatus
	platform: string | null
	latency: number | null
	pcRef: React.RefObject<RTCPeerConnection | null>
	subscribeMirrorStream: (
		cb: (stream: MediaStream | null) => void,
	) => () => void
	createPeerConnection: () => RTCPeerConnection
	closePeerConnection: () => void
	send: (msg: unknown) => void
	sendInput: (msg: unknown) => void
	configureMediaSender: (pc: RTCPeerConnection, sender: RTCRtpSender) => void
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
}: {
	children: React.ReactNode
}) {
	const wsRef = useRef<WebSocket | null>(null)
	const [status, setStatus] = useState<ConnectionStatus>("disconnected")
	const [platform, setPlatform] = useState<string | null>(null)
	const [latency, setLatency] = useState<number | null>(null)
	const isMountedRef = useRef(true)
	const subscribersRef = useRef<Record<string, Set<(msg: unknown) => void>>>({})
	const mirrorStreamSubscribersRef = useRef<
		Set<(stream: MediaStream | null) => void>
	>(new Set())

	const reconnectCountRef = useRef(0)
	const reconnectTimerRef = useRef<number | null>(null)

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

	const send = useCallback((msg: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg))
		}
	}, [])

	const handleTrackReceived = useCallback((stream: MediaStream | null) => {
		for (const cb of mirrorStreamSubscribersRef.current) {
			cb(stream)
		}
	}, [])

	const {
		pcRef,
		createPeerConnection,
		handleSignalingMessage,
		sendInput,
		configureMediaSender,
		closePeerConnection,
	} = useWebRTC(send, handleTrackReceived)

	useEffect(() => {
		isMountedRef.current = true
		const connect = () => {
			if (!isMountedRef.current) return

			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = null
			}

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
			const host = window.location.host
			const urlParams = new URLSearchParams(window.location.search)
			const urlToken = urlParams.get("token")

			let storedToken: string | null = null
			try {
				storedToken = localStorage.getItem("rein_auth_token")
			} catch (_e) {
				// Restricted context
			}

			const token = urlToken || storedToken

			if (urlToken && urlToken !== storedToken) {
				try {
					localStorage.setItem("rein_auth_token", urlToken)
				} catch (_e) {}
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

			socket.onopen = async () => {
				if (isMountedRef.current) {
					setStatus("connected")
					reconnectCountRef.current = 0

					if (reconnectTimerRef.current) {
						clearTimeout(reconnectTimerRef.current)
						reconnectTimerRef.current = null
					}
				}
			}

			socket.onmessage = async (event) => {
				if (!isMountedRef.current) return

				if (event.data instanceof Blob) {
					return
				}

				try {
					const msg = JSON.parse(event.data)

					if (msg.type === "connected") {
						setPlatform(msg.platform || null)
					}

					if (
						msg.type === "offer" ||
						msg.type === "answer" ||
						msg.type === "ice-candidate"
					) {
						handleSignalingMessage(msg)
					}

					const typeSubscribers = subscribersRef.current[msg.type]
					if (typeSubscribers) {
						for (const callback of typeSubscribers) {
							callback(msg)
						}
					}
				} catch (_e) {}
			}

			socket.onclose = () => {
				if (isMountedRef.current) {
					setStatus("disconnected")
					const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 30000)
					reconnectCountRef.current += 1

					if (reconnectTimerRef.current) {
						clearTimeout(reconnectTimerRef.current)
					}
					reconnectTimerRef.current = window.setTimeout(connect, delay)
				}
			}

			socket.onerror = () => {
				socket.close()
			}

			wsRef.current = socket
		}
		connect()

		return () => {
			isMountedRef.current = false
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = null
			}
			if (wsRef.current) {
				wsRef.current.onopen = null
				wsRef.current.onclose = null
				wsRef.current.onerror = null
				wsRef.current.close()
				wsRef.current = null
			}
		}
	}, [handleSignalingMessage]) // Depend on handleSignalingMessage

	// Ping/Pong heartbeat
	useEffect(() => {
		if (status !== "connected") {
			setLatency(null)
			return
		}
		const ws = wsRef.current
		if (!ws) return

		const handlePong = (msg: unknown) => {
			const pong = msg as { timestamp?: number }
			if (pong.timestamp) {
				setLatency(Date.now() - pong.timestamp)
			}
		}
		if (!subscribersRef.current.pong) {
			subscribersRef.current.pong = new Set()
		}
		subscribersRef.current.pong.add(handlePong)

		const sendPing = () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: "ping",
						timestamp: Date.now(),
					}),
				)
			}
		}
		sendPing()
		const interval = setInterval(sendPing, 2000)

		return () => {
			subscribersRef.current.pong.delete(handlePong)
			clearInterval(interval)
		}
	}, [status])

	return (
		<ConnectionContext.Provider
			value={{
				wsRef,
				status,
				platform,
				latency,
				pcRef,
				subscribeMirrorStream: (cb) => {
					mirrorStreamSubscribersRef.current.add(cb)
					return () => mirrorStreamSubscribersRef.current.delete(cb)
				},
				createPeerConnection,
				closePeerConnection,
				send,
				sendInput,
				configureMediaSender,
				subscribe,
			}}
		>
			{children}
		</ConnectionContext.Provider>
	)
}
