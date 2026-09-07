import os from "node:os"

const VIRTUAL_NAME_RE =
	/virtualbox|vmware|vmnet|vboxnet|veth|hyper-v|docker|virbr|tap|tun|wsl|loopback adapter/i
const PHYSICAL_NAME_RE = /wi-fi|wifi|wlan|ethernet|en\d|eth\d/i
const VIRTUAL_SUBNET_PREFIXES = ["192.168.56.", "192.168.99.", "10.0.2."]

export function getLanIp(): string {
	const ifaces = os.networkInterfaces()
	let bestAddress: string | null = null
	let bestScore = -Infinity

	for (const [name, list] of Object.entries(ifaces)) {
		if (!list) continue
		for (const iface of list) {
			if (iface.family !== "IPv4" || iface.internal) continue

			let score = 0
			if (VIRTUAL_NAME_RE.test(name)) score -= 100
			if (PHYSICAL_NAME_RE.test(name)) score += 20
			if (VIRTUAL_SUBNET_PREFIXES.some((p) => iface.address.startsWith(p)))
				score -= 50
			const [a, b] = iface.address.split(".").map(Number)
			if (a === 10) score += 10
			if (a === 172 && b >= 16 && b <= 31) score += 10
			if (a === 192 && b === 168) score += 10

			if (bestAddress === null || score > bestScore) {
				bestAddress = iface.address
				bestScore = score
			}
		}
	}

	return bestAddress ?? "127.0.0.1"
}

export function isLoopbackAddress(addr?: string | null): boolean {
	if (!addr) return false
	return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}

export function getAuthHeaders(authToken?: string): Record<string, string> {
	if (!authToken) return {}
	return { Authorization: `Bearer ${authToken}` }
}
