"use client"
/**
 * Mirror Stream Receiver Hook
 * This hook handles subscribing to the incoming WebRTC media stream and binding
 * it directly to a video element for display.
 */
import type { RefObject } from "react"
import { useConnection } from "@/contexts/ConnectionProvider"
import { useEffect, useRef, useState } from "react"

export function useMirrorStream(
	videoRef: RefObject<HTMLVideoElement | null>,
	status: "connecting" | "connected" | "disconnected",
) {
	const { subscribeMirrorStream, send } = useConnection()
	const [hasStream, setHasStream] = useState(false)

	const sendRef = useRef(send)
	sendRef.current = send

	const subRef = useRef(subscribeMirrorStream)
	subRef.current = subscribeMirrorStream

	useEffect(() => {
		if (status !== "connected") return

		sendRef.current({ type: "start-mirror" })

		const unsub = subRef.current((stream) => {
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				if (stream) {
					videoRef.current.play().catch(() => {})
					setHasStream(true)
				} else {
					setHasStream(false)
				}
			}
		})

		return () => {
			unsub()
			if (videoRef.current) {
				videoRef.current.srcObject = null
			}
			setHasStream(false)
			sendRef.current({ type: "stop-mirror" })
		}
	}, [status, videoRef])

	return { hasStream }
}
