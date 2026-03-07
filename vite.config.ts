import { URL, fileURLToPath } from "node:url"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"
import serverConfig from "./src/server-config.json"
import { createWsServer } from "./src/server/websocket"

const config = defineConfig({
	base: "./",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	plugins: [
		{
			name: "websocket-server",
			configureServer(server) {
				if (server.httpServer) {
					createWsServer(server.httpServer as import("http").Server)
				}
			},
			configurePreviewServer(server) {
				if (server.httpServer) {
					createWsServer(server.httpServer as import("http").Server)
				}
			},
		},
		devtools(),
		nitro(),
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tanstackStart(),
		viteReact(),
	],
	server: {
		host: serverConfig.host === "0.0.0.0" ? true : serverConfig.host,
		port: serverConfig.frontendPort,
	},
	build: {
		outDir: ".output",
		emptyOutDir: true,
	},
})

export default config
