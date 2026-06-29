/**
 * Routing and signaling engine setup.
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import http from "node:http"
import logger from "../utils/logger"
import { WHIP_INTERNAL_PORT } from "./api/apiState"
import {
	handleCreateSession,
	handleGetSession,
	handleDeleteSession,
	handleOffer,
	handleAnswer,
	handleIce,
	handleEvents,
	handleHostStart,
	handleHostStop,
	handleHostStatus,
	handleInputOffer,
	handleGenerateToken,
	handleGetToken,
	handleGstSignalingGateway,
	handleWhipSignalingExchange,
	handleGetIp,
	handleUpdateConfig,
	json,
} from "./api/apiHandlers"

interface Route {
	method: string
	pattern: RegExp
	handler: (
		req: IncomingMessage,
		res: ServerResponse,
		...params: string[]
	) => void | Promise<void>
}

const routes: Route[] = [
	{ method: "GET", pattern: /^\/api\/host\/ip$/, handler: handleGetIp },
	{ method: "POST", pattern: /^\/api\/config$/, handler: handleUpdateConfig },
	{ method: "POST", pattern: /^\/api\/session$/, handler: handleCreateSession },
	{
		method: "GET",
		pattern: /^\/api\/session\/([^/]+)$/,
		handler: (req, res, id) => handleGetSession(req, res, id),
	},
	{
		method: "DELETE",
		pattern: /^\/api\/session\/([^/]+)$/,
		handler: (req, res, id) => handleDeleteSession(req, res, id),
	},
	{ method: "POST", pattern: /^\/api\/webrtc\/offer$/, handler: handleOffer },
	{ method: "POST", pattern: /^\/api\/webrtc\/answer$/, handler: handleAnswer },
	{ method: "POST", pattern: /^\/api\/webrtc\/ice$/, handler: handleIce },
	{ method: "GET", pattern: /^\/api\/webrtc\/events$/, handler: handleEvents },
	{ method: "POST", pattern: /^\/api\/host\/start$/, handler: handleHostStart },
	{ method: "POST", pattern: /^\/api\/host\/stop$/, handler: handleHostStop },
	{
		method: "GET",
		pattern: /^\/api\/host\/status$/,
		handler: handleHostStatus,
	},
	{
		method: "POST",
		pattern: /^\/api\/webrtc\/input-offer$/,
		handler: handleInputOffer,
	},
	{
		method: "POST",
		pattern: /^\/api\/auth\/token$/,
		handler: handleGenerateToken,
	},
	{ method: "GET", pattern: /^\/api\/auth\/token$/, handler: handleGetToken },
	{
		method: "POST",
		pattern: /^\/api\/webrtc\/gateway$/,
		handler: handleGstSignalingGateway,
	},
	{
		method: "POST",
		pattern: /^\/api\/webrtc\/whip$/,
		handler: handleWhipSignalingExchange,
	},
]

function startWhipInternalServer(): void {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "", `http://127.0.0.1:${WHIP_INTERNAL_PORT}`)
		if (req.method === "POST" && url.pathname === "/api/webrtc/whip") {
			handleWhipSignalingExchange(req, res)
		} else {
			res.writeHead(404)
			res.end()
		}
	})
	server.listen(WHIP_INTERNAL_PORT, "127.0.0.1", () => {
		logger.info(
			`WHIP internal endpoint listening on port ${WHIP_INTERNAL_PORT}`,
		)
	})
	server.on("error", (err) => {
		logger.error(`WHIP internal server failed to start: ${String(err)}`)
	})
}

export function attachSignalingRoutes(
	server: NonNullable<import("vite").ViteDevServer["httpServer"]>,
): void {
	server.prependListener(
		"request",
		(req: IncomingMessage, res: ServerResponse) => {
			const pathname = new URL(
				req.url ?? "",
				`http://${req.headers.host ?? "localhost"}`,
			).pathname

			if (!pathname.startsWith("/api/")) return

			const method = req.method?.toUpperCase() ?? "GET"
			for (const route of routes) {
				if (route.method !== method) continue
				const match = pathname.match(route.pattern)
				if (!match) continue

				const originalSetHeader = res.setHeader.bind(res)
				const originalWriteHead = res.writeHead.bind(res)
				res.setHeader = (...args: Parameters<typeof res.setHeader>) => {
					if (res.headersSent) return res
					return originalSetHeader(...args)
				}
				res.writeHead = ((...args: unknown[]) => {
					if (res.writableEnded) return res
					return (originalWriteHead as (...a: unknown[]) => ServerResponse)(
						...args,
					)
				}) as typeof res.writeHead

				const params = match.slice(1)
				Promise.resolve(route.handler(req, res, ...params)).catch((err) => {
					logger.error(`Signaling route error: ${String(err)}`)
					if (!res.headersSent)
						json(res, 500, { error: "Internal server error" })
				})
				return
			}
		},
	)
	startWhipInternalServer()
	logger.info("Signaling HTTP routes attached")
}

// Re-export state and event systems for other signaling servers/files
export { sessions, hostStatus, pushEvent } from "./api/apiState"
