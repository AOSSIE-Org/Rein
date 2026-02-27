export type SignalingMessage = {
	type?: string
	offer?: RTCSessionDescriptionInit
	answer?: RTCSessionDescriptionInit
	candidate?: RTCIceCandidateInit
}
