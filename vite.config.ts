import { URL, fileURLToPath } from "node:url"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import serverConfig from "./src/server-config.json"
import { createWsServer } from "./src/server/websocket"

const config = defineConfig({
	base: "/",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	plugins: [
		{
			name: "websocket-server",
			async configureServer(server) {
				const httpServer = server.httpServer
				if (!httpServer) return
				await createWsServer(httpServer)
			},
			async configurePreviewServer(server) {
				const httpServer = server.httpServer
				if (!httpServer) return
				await createWsServer(httpServer)
			},
		},
		devtools(),
		nitro(),

		tanstackStart(),
		viteReact(),
	],
	server: {
		host: serverConfig.host === "0.0.0.0" ? true : serverConfig.host,
		port: serverConfig.frontendPort,
	},
})

export default config
