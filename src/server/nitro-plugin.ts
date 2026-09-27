import net from "node:net"
import { attachSignalingRoutes } from "./signalling/server"

// Nitro server plugin – wires up signaling API routes in production.
// Runs inside the compiled .output/server/index.mjs.

// biome-ignore lint/suspicious/noExplicitAny: prototype patching requires any
export default function (_nitroApp: any) {
	const origListen = net.Server.prototype.listen
	// biome-ignore lint/suspicious/noExplicitAny: prototype patching requires any
	net.Server.prototype.listen = function (this: any, ...args: any[]) {
		// Restore immediately — only intercept the first listen() (the srvx server)
		net.Server.prototype.listen = origListen
		// Attach all /api/* handlers + WebRTC + GStreamer to this server
		attachSignalingRoutes(this)
		// biome-ignore lint/suspicious/noExplicitAny: forwarding variadic args
		return (origListen as any).apply(this, args)
	}
}
