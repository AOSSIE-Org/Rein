import { useEffect, useRef } from "react"
import { io } from "socket.io-client"

const socket = io("http://localhost:3001")

export default function ScreenReceiver() {
	const videoRef = useRef<HTMLVideoElement>(null)

	useEffect(() => {
		const pc = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		})

		// 📺 Show the incoming stream in the video element
		pc.ontrack = ({ streams }) => {
			if (videoRef.current) {
				videoRef.current.srcObject = streams[0]
			}
		}

		socket.on("offer", async (offer) => {
			await pc.setRemoteDescription(offer)
			const answer = await pc.createAnswer()
			await pc.setLocalDescription(answer)
			socket.emit("answer", answer)
		})

		socket.on("ice-candidate", async (candidate) => {
			await pc.addIceCandidate(candidate)
		})
	}, [])

	return (
		<video
			ref={videoRef}
			autoPlay
			playsInline
			style={{ width: "100%", border: "2px solid #333" }}
		>
			<track kind="captions" />
		</video>
	)
}
