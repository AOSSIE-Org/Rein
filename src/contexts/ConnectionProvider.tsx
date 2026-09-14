"use client"

import type React from "react"
import {
	createContext,
	useContext,
	useRef,
	useState,
	useCallback,
	useEffect,
} from "react"
import { getLocalStorageItem } from "../utils/safeLocalStorage"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

interface ConnectionContextType {
	status: ConnectionStatus
	latency: number | null
	send: (msg: unknown) => void
	registerDataChannel: (
		unorderedDc: RTCDataChannel,
		orderedDc: RTCDataChannel,
	) => void
}

const ConnectionContext = createContext<ConnectionContextType | null>(null)

export const useConnection = () => {
	const ctx = useContext(ConnectionContext)
	if (!ctx) throw new Error("useConnection must be inside ConnectionProvider")
	return ctx
}

export function ConnectionProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const unorderedDcRef = useRef<RTCDataChannel | null>(null)
	const orderedDcRef = useRef<RTCDataChannel | null>(null)
	const [status, setStatus] = useState<ConnectionStatus>("disconnected")
	const [latency, setLatency] = useState<number | null>(null)

	const send = useCallback((msg: unknown) => {
		const type =
			msg && typeof msg === "object" && "type" in msg
				? (msg as { type: string }).type
				: null

		// High frequency mouse/touch inputs go to unordered; keyboard/clicks and others go to ordered.
		const isUnordered =
			type === "move" ||
			type === "scroll" ||
			type === "touch" ||
			type === "zoom"
		if (isUnordered) {
			if (unorderedDcRef.current?.readyState === "open") {
				unorderedDcRef.current.send(JSON.stringify(msg))
			}
		} else {
			if (orderedDcRef.current?.readyState === "open") {
				orderedDcRef.current.send(JSON.stringify(msg))
			}
		}
	}, [])

	const lastReportTimeRef = useRef<number>(0)

	const registerDataChannel = useCallback(
		(unorderedDc: RTCDataChannel, orderedDc: RTCDataChannel) => {
			unorderedDcRef.current = unorderedDc
			orderedDcRef.current = orderedDc
			setStatus("connecting")

			const updateStatus = () => {
				if (
					unorderedDc.readyState === "open" &&
					orderedDc.readyState === "open"
				) {
					setStatus("connected")
				} else if (
					unorderedDc.readyState === "closed" ||
					orderedDc.readyState === "closed"
				) {
					setStatus("disconnected")
					setLatency(null)
				}
			}

			const handleMessage = (e: MessageEvent) => {
				try {
					const parsed = JSON.parse(e.data) as {
						type?: string
						timestamp?: number
					}
					if (parsed.type === "pong" && parsed.timestamp) {
						const ms = Date.now() - parsed.timestamp
						setLatency(ms)
						// Report measured RTT to the host debug dashboard (throttled every 10s)
						const now = Date.now()
						if (now - lastReportTimeRef.current > 10000) {
							lastReportTimeRef.current = now
							const token =
								typeof window !== "undefined"
									? new URLSearchParams(window.location.search).get("token") ||
										getLocalStorageItem("rein_auth_token")
									: null
							fetch("/api/debug/report-latency", {
								method: "POST",
								headers: {
									"Content-Type": "application/json",
									...(token ? { Authorization: `Bearer ${token}` } : {}),
								},
								body: JSON.stringify({ latencyMs: ms }),
							})
								.then((res) => {
									if (!res.ok) {
										console.error("Failed to report latency:", res.status)
									}
								})
								.catch(() => {})
						}
					}
				} catch {}
			}

			unorderedDc.onopen = updateStatus
			orderedDc.onopen = updateStatus
			unorderedDc.onclose = updateStatus
			orderedDc.onclose = updateStatus
			unorderedDc.onerror = updateStatus
			orderedDc.onerror = updateStatus

			unorderedDc.onmessage = handleMessage
			orderedDc.onmessage = handleMessage
		},
		[],
	)

	// Ping/Pong heartbeat for latency measurement
	useEffect(() => {
		if (status !== "connected") {
			setLatency(null)
			return
		}

		const sendPing = () => send({ type: "ping", timestamp: Date.now() })
		sendPing()
		const interval = setInterval(sendPing, 2000)

		return () => {
			clearInterval(interval)
		}
	}, [status, send])

	return (
		<ConnectionContext.Provider
			value={{ status, latency, send, registerDataChannel }}
		>
			{children}
		</ConnectionContext.Provider>
	)
}
