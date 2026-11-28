import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("configHelper", () => {
	let tempDir: string
	const originalEnv = {
		reinDataDir: process.env.REIN_DATA_DIR,
		xdgConfigHome: process.env.XDG_CONFIG_HOME,
		home: process.env.HOME,
	}

	async function importConfigHelper() {
		vi.resetModules()
		return import("@/utils/configHelper.ts")
	}

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rein-config-test-"))
		delete process.env.REIN_DATA_DIR
		delete process.env.XDG_CONFIG_HOME
		process.env.HOME = tempDir
	})

	afterEach(() => {
		if (originalEnv.reinDataDir === undefined) delete process.env.REIN_DATA_DIR
		else process.env.REIN_DATA_DIR = originalEnv.reinDataDir
		if (originalEnv.xdgConfigHome === undefined)
			delete process.env.XDG_CONFIG_HOME
		else process.env.XDG_CONFIG_HOME = originalEnv.xdgConfigHome
		if (originalEnv.home === undefined) delete process.env.HOME
		else process.env.HOME = originalEnv.home
		fs.rmSync(tempDir, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	it("prefers REIN_DATA_DIR over XDG_CONFIG_HOME", async () => {
		const dataDir = path.join(tempDir, "data")
		process.env.REIN_DATA_DIR = dataDir
		process.env.XDG_CONFIG_HOME = path.join(tempDir, "xdg")
		const config = await importConfigHelper()

		expect(config.getWritableConfigPath()).toBe(
			path.join(dataDir, "server-config.json"),
		)
		expect(fs.existsSync(dataDir)).toBe(true)
		expect(fs.existsSync(process.env.XDG_CONFIG_HOME)).toBe(false)
	})

	it("uses XDG_CONFIG_HOME/rein when REIN_DATA_DIR is unset", async () => {
		const xdgDir = path.join(tempDir, "xdg")
		process.env.XDG_CONFIG_HOME = xdgDir
		const config = await importConfigHelper()

		expect(config.getWritableConfigPath()).toBe(
			path.join(xdgDir, "rein", "server-config.json"),
		)
	})

	it("falls back to ~/.config/rein when both config variables are unset", async () => {
		const config = await importConfigHelper()

		expect(config.getWritableConfigPath()).toBe(
			path.join(tempDir, ".config", "rein", "server-config.json"),
		)
	})

	it("loads an object config, merges saves, and reloads the updated cache", async () => {
		const dataDir = path.join(tempDir, "data")
		process.env.REIN_DATA_DIR = dataDir
		fs.mkdirSync(dataDir, { recursive: true })
		fs.writeFileSync(
			path.join(dataDir, "server-config.json"),
			JSON.stringify({ host: "127.0.0.1", frontendPort: 3000 }),
		)
		const config = await importConfigHelper()

		expect(config.loadServerConfig()).toEqual({
			host: "127.0.0.1",
			frontendPort: 3000,
		})
		config.saveServerConfig({ frontendPort: 4000, invertScroll: true })

		expect(config.loadServerConfig()).toEqual({
			host: "127.0.0.1",
			frontendPort: 4000,
			invertScroll: true,
		})
		expect(
			fs.statSync(path.join(dataDir, "server-config.json")).mode & 0o777,
		).toBe(0o600)
	})

	it("treats non-object JSON as an empty config", async () => {
		const dataDir = path.join(tempDir, "data")
		process.env.REIN_DATA_DIR = dataDir
		fs.mkdirSync(dataDir, { recursive: true })
		fs.writeFileSync(path.join(dataDir, "server-config.json"), "[]")
		const config = await importConfigHelper()

		expect(config.loadServerConfig()).toEqual({})
	})

	it("treats malformed JSON as an empty config", async () => {
		const dataDir = path.join(tempDir, "data")
		process.env.REIN_DATA_DIR = dataDir
		fs.mkdirSync(dataDir, { recursive: true })
		fs.writeFileSync(path.join(dataDir, "server-config.json"), "{")
		const config = await importConfigHelper()

		expect(config.loadServerConfig()).toEqual({})
	})

	it("falls back to the default upload directory when the configured path cannot be created", async () => {
		const dataDir = path.join(tempDir, "data")
		process.env.REIN_DATA_DIR = dataDir
		fs.mkdirSync(dataDir, { recursive: true })
		const configuredFile = path.join(tempDir, "not-a-directory")
		fs.writeFileSync(configuredFile, "file")
		const config = await importConfigHelper()
		config.saveServerConfig({ uploadDir: configuredFile })
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		expect(config.getUploadDir()).toBe(
			path.join(tempDir, "Downloads", "ReinShared"),
		)
		expect(fs.existsSync(path.join(tempDir, "Downloads", "ReinShared"))).toBe(
			true,
		)
		expect(warn).toHaveBeenCalledOnce()
	})
})
