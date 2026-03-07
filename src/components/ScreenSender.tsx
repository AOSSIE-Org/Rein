import { useRef } from "react"
import { io } from "socket.io-client"
import { useWebRTCStream } from "../hooks/useWebRTCStream"

const socket = io("http://localhost:3001")

export default function ScreenSender() {
	const { startCapture } = useWebRTCStream()
	const pcRef = useRef<RTCPeerConnection | null>(null)

	const startStreaming = async () => {
		const stream = await startCapture() // 🖥️ grab screen

		const pc = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		})
		pcRef.current = pc

		// Add all video/audio tracks to the connection
		for (const track of stream.getTracks()) {
			pc.addTrack(track, stream)
		}

		// Send ICE candidates to the other side
		pc.onicecandidate = ({ candidate }) => {
			if (candidate) socket.emit("ice-candidate", candidate)
		}

		// Create and send the offer
		const offer = await pc.createOffer()
		await pc.setLocalDescription(offer)
		socket.emit("offer", offer)

		// Handle the answer back
		socket.on("answer", async (answer) => {
			await pc.setRemoteDescription(answer)
		})

		socket.on("ice-candidate", async (candidate) => {
			await pc.addIceCandidate(candidate)
		})
	}

	return (
		<button type="button" onClick={startStreaming}>
			🎬 Start Screen Share
		</button>
	)
}
