/**
 * GStreamer path resolution.
 *
 * Resolves the path to `gst-launch-1.0` and the required environment variables
 * for running a GStreamer pipeline. Prefers the locally bundled GStreamer
 * install at `<project-root>/bin/gstreamer/` and falls back to the
 * system-installed GStreamer.
 */

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import logger from "../../utils/logger"

function resolveProjectRoot(): string {
	const currentFile = fileURLToPath(import.meta.url)
	let dir = path.dirname(currentFile)
	for (let i = 0; i < 10; i++) {
		if (fs.existsSync(path.join(dir, "package.json"))) {
			return dir
		}
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return process.cwd()
}

const PROJECT_ROOT = resolveProjectRoot()
const BUNDLED_GSTREAMER_ROOT = path.join(PROJECT_ROOT, "bin", "gstreamer")

const GST_LAUNCH =
	os.platform() === "win32" ? "gst-launch-1.0.exe" : "gst-launch-1.0"

const GST_INSPECT =
	os.platform() === "win32" ? "gst-inspect-1.0.exe" : "gst-inspect-1.0"

export interface GstPaths {
	/** Absolute path to the `gst-launch-1.0` executable. */
	gstLaunch: string
	/** Absolute path to `gst-inspect-1.0` (useful for diagnostics). */
	gstInspect: string
	/** Whether we are using the locally bundled GStreamer. */
	isBundled: boolean
	/** Environment variables to set when running GStreamer. */
	env: Record<string, string>
}

function hasBundledGstreamer(): boolean {
	const exe = path.join(BUNDLED_GSTREAMER_ROOT, "bin", GST_LAUNCH)
	return fs.existsSync(exe)
}

function bundledPaths(): GstPaths {
	const binDir = path.join(BUNDLED_GSTREAMER_ROOT, "bin")
	const pluginDir = path.join(BUNDLED_GSTREAMER_ROOT, "lib", "gstreamer-1.0")
	const pluginScannerDir = path.join(
		BUNDLED_GSTREAMER_ROOT,
		"libexec",
		"gstreamer-1.0",
	)
	const registryPath = path.join(BUNDLED_GSTREAMER_ROOT, "registry.bin")

	const env: Record<string, string> = {
		GST_PLUGIN_PATH: pluginDir,
		GST_PLUGIN_SCANNER: path.join(
			pluginScannerDir,
			os.platform() === "win32"
				? "gst-plugin-scanner.exe"
				: "gst-plugin-scanner",
		),
		GST_REGISTRY: registryPath,
	}

	if (os.platform() === "win32") {
		const existingPath = process.env.PATH ?? ""
		env.PATH = `${binDir};${existingPath}`
	} else if (os.platform() === "linux") {
		const existingLdPath = process.env.LD_LIBRARY_PATH ?? ""
		env.LD_LIBRARY_PATH = existingLdPath
			? `${binDir}:${existingLdPath}`
			: binDir
	} else if (os.platform() === "darwin") {
		const existingDyldPath = process.env.DYLD_LIBRARY_PATH ?? ""
		const libDir = path.join(BUNDLED_GSTREAMER_ROOT, "lib")
		env.DYLD_LIBRARY_PATH = existingDyldPath
			? `${libDir}:${existingDyldPath}`
			: libDir
	}

	return {
		gstLaunch: path.join(binDir, GST_LAUNCH),
		gstInspect: path.join(binDir, GST_INSPECT),
		isBundled: true,
		env,
	}
}

function systemPaths(): GstPaths {
	return {
		gstLaunch: GST_LAUNCH, // rely on PATH
		gstInspect: GST_INSPECT,
		isBundled: false,
		env: {},
	}
}

export function resolveGstPaths(): GstPaths {
	if (hasBundledGstreamer()) {
		logger.info(`Using bundled GStreamer at ${BUNDLED_GSTREAMER_ROOT}`)
		return bundledPaths()
	}

	logger.info(
		"Bundled GStreamer not found — falling back to system-installed GStreamer",
	)
	return systemPaths()
}
