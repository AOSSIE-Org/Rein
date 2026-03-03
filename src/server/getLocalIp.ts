import dgram from "node:dgram"

export async function getLocalIp(): Promise<string> {
	return new Promise((resolve) => {
		const socket = dgram.createSocket("udp4")

		const timeout = setTimeout(() => {
			socket.close()
			resolve("127.0.0.1")
		}, 1000)

		socket.connect(1, "10.255.255.255")

		socket.on("connect", () => {
			clearTimeout(timeout)

			const addr = socket.address()
			socket.close()

			if (typeof addr === "object") {
				resolve(addr.address)
			} else {
				resolve("127.0.0.1")
			}
		})

		socket.on("error", () => {
			clearTimeout(timeout)
			socket.close()
			resolve("127.0.0.1")
		})
	})
}
