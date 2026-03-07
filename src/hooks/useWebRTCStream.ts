import { useState } from "react"

export const useWebRTCStream = () => {
	const [stream, setStream] = useState<MediaStream | null>(null)

	// 🖥️ Capture screen - works on Wayland, NO FPS cap!
	const startCapture = async () => {
		const mediaStream = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: { ideal: 60, max: 144 } },
			audio: true,
		})
		setStream(mediaStream)
		return mediaStream
	}

	const stopCapture = () => {
		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop()
			}
		}
		setStream(null)
	}

	return { stream, startCapture, stopCapture }
}
