import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"
import * as esbuild from "esbuild"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, "dist")

if (fs.existsSync(distDir)) {
	fs.rmSync(distDir, { recursive: true, force: true })
}
fs.mkdirSync(distDir, { recursive: true })

const commonOptions = {
	entryPoints: [path.resolve(__dirname, "src/index.ts")],
	bundle: true,
	platform: "node",
	target: "node18",
	external: ["koffi"],
	sourcemap: true,
}

console.log("[@aossie/rein-input] Building ESM bundle...")
await esbuild.build({
	...commonOptions,
	format: "esm",
	outfile: path.resolve(distDir, "index.js"),
})

console.log("[@aossie/rein-input] Building CJS bundle...")
await esbuild.build({
	...commonOptions,
	format: "cjs",
	outfile: path.resolve(distDir, "index.cjs"),
})

console.log("[@aossie/rein-input] Generating TypeScript declaration files...")
execSync("npx tsc -p tsconfig.json", {
	cwd: __dirname,
	stdio: "inherit",
})

console.log("[@aossie/rein-input] Build completed successfully!")
