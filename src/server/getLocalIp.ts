import dgram from "node:dgram"

export async function getLocalIp(): Promise<string> {
	return new Promise((resolve) => {
		const socket = dgram.createSocket("udp4")
		let settled = false

		const finish = (ip: string) => {
			if (settled) return
			settled = true

			clearTimeout(timeout)
			socket.removeAllListeners("connect")
			socket.removeAllListeners("error")

			try {
				socket.close()
			} catch {
				// socket may already be closed
			}

			resolve(ip)
		}

		const timeout = setTimeout(() => {
			finish("127.0.0.1")
		}, 1000)

		socket.connect(1, "10.255.255.255")

		socket.on("connect", () => {
			const addr = socket.address()
			if (typeof addr === "object") {
				finish(addr.address)
			} else {
				finish("127.0.0.1")
			}
		})

		socket.on("error", () => {
			finish("127.0.0.1")
		})
	})
}
