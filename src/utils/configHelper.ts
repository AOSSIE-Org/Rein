import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface ServerConfig {
	host?: string
	frontendPort?: number
	address?: string
	inputThrottleMs?: number
	sensitivity?: number
	invertScroll?: boolean
	verboseLogs?: boolean
	useSystemGstreamer?: boolean
	useGlobalGstreamer?: boolean
	disableBundledGstreamer?: boolean
	/** framerate: null = dynamic frame rate. */
	framerate?: number | null
	streamQuality?: "performance" | "intermediate" | "quality"
	audioSource?: string
	version?: string
}
let cachedConfig: ServerConfig | null = null

export function getServerConfigPath(): string | null {
	const candidates: string[] = []

	// Electron resourcesPath if packaged
	const resourcesPath = (process as unknown as { resourcesPath?: string })
		.resourcesPath
	if (resourcesPath) {
		candidates.push(
			path.join(resourcesPath, "src", "server-config.json"),
			path.join(resourcesPath, "server-config.json"),
		)
	}

	// Current working directory
	const cwd = process.cwd()
	candidates.push(
		path.join(cwd, "src", "server-config.json"),
		path.join(cwd, "server-config.json"),
	)

	// Relative to current module file
	try {
		const currentDir = path.dirname(fileURLToPath(import.meta.url))
		candidates.push(
			path.join(currentDir, "..", "server-config.json"),
			path.join(currentDir, "..", "..", "src", "server-config.json"),
			path.join(currentDir, "..", "..", "server-config.json"),
		)
	} catch {}

	for (const candidate of candidates) {
		try {
			if (fs.existsSync(candidate)) {
				return candidate
			}
		} catch {}
	}

	return null
}

/**
 * Returns the writable directory for user-owned runtime config.
 * Priority: REIN_DATA_DIR env → XDG_CONFIG_HOME/rein → ~/.config/rein
 * Always writable; created on demand.
 */
function getWritableConfigDir(): string {
	if (process.env.REIN_DATA_DIR) return process.env.REIN_DATA_DIR

	const xdgConfig = process.env.XDG_CONFIG_HOME
	const base = xdgConfig ?? path.join(os.homedir(), ".config")
	return path.join(base, "rein")
}

/**
 * Returns the writable path for server-config.json, seeding it from the
 * bundled read-only copy if it doesn't exist yet.
 */
export function getWritableConfigPath(): string {
	const dir = getWritableConfigDir()
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
	const writablePath = path.join(dir, "server-config.json")

	// Seed from bundled defaults on first run
	if (!fs.existsSync(writablePath)) {
		const bundledPath = getServerConfigPath()
		if (bundledPath) {
			try {
				fs.copyFileSync(bundledPath, writablePath)
			} catch {}
		}
	}

	return writablePath
}

export function loadServerConfig(): ServerConfig {
	if (cachedConfig) return cachedConfig

	const configPath = getWritableConfigPath()

	try {
		const raw = fs.readFileSync(configPath, "utf-8")
		const parsed: unknown = JSON.parse(raw)
		cachedConfig =
			parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as ServerConfig)
				: {}
	} catch {
		cachedConfig = {}
	}
	return cachedConfig
}

/**
 * Merges partial fields into user-writable server-config.json and clears the in-memory cache
 * so the next loadServerConfig() call reads the updated file.
 */
export function saveServerConfig(partial: Partial<ServerConfig>): void {
	const writePath = getWritableConfigPath()
	const tmpPath = `${writePath}.tmp`

	const existing = loadServerConfig()
	const merged = { ...existing, ...partial }
	fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), {
		encoding: "utf-8",
		mode: 0o600,
	})
	fs.renameSync(tmpPath, writePath)
	cachedConfig = null
}
