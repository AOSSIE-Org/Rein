/**
 * WebRTC Configuration
 *
 * For production deployments, it is highly recommended to provide TURN servers
 * to ensure connectivity across restrictive firewalls and symmetric NATs.
 */
export const ICE_SERVERS: RTCConfiguration = {
	iceServers: [
		{
			urls: [
				"stun:stun.l.google.com:19302",
				"stun:stun1.l.google.com:19302",
				"stun:stun2.l.google.com:19302",
			],
		},
		// {
		//   urls: "turn:your-turn-server.com:3478",
		//   username: "user",
		//   credential: "password"
		// }
	],
}
