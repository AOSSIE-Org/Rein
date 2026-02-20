import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'url'
import { nitro } from 'nitro/vite'
import serverConfig from './src/server-config.json'

import { createWsServer } from './src/server/websocket'

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [

    {
      name: 'websocket-server',
      configureServer(server) {
        if (server.httpServer) {
          createWsServer(server.httpServer);
        }
      },
      configurePreviewServer(server) {
        if (server.httpServer) {
          createWsServer(server.httpServer);
        }
      }
    },
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),

    tanstackStart(),
    viteReact(),
  ],
  server: {
    host: serverConfig.host === '0.0.0.0' ? true : serverConfig.host,
    port: serverConfig.frontendPort,
  }
})

export default config
