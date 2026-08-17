import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@aossie/rein-input": path.resolve(__dirname, "./packages/rein-input/src"),
		},
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
	},
})
