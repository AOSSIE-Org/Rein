
/**
 * GStreamer bundled binary installer.
 *
 * Downloads the platform-specific GStreamer binary archive from a GitHub release
 * and extracts it into `bin/gstreamer/` at the project root.
 *
 * Runs automatically as an npm postinstall hook.
 * Skips download if the binaries already exist locally.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const GSTREAMER_DIR = path.join(PROJECT_ROOT, "bin", "gstreamer");
const RELEASE_BASE_URL =
	"https://github.com/AOSSIE-Org/Rein/releases/download/Dependencies";

const PLATFORM_ARCHIVES = {
	win32: `${RELEASE_BASE_URL}/gstreamer-windows-x64.rar`,
	linux: `${RELEASE_BASE_URL}/gstreamer-linux-x64.tar.xz`,
	darwin: `${RELEASE_BASE_URL}/gstreamer-macos-x64.tar.xz`,
};
const SENTINEL = path.join(GSTREAMER_DIR, ".installed");

// ---------------------------------------------------------------------------
function getPlatformUrl() {
	const platform = process.platform;
	const url = PLATFORM_ARCHIVES[platform];
	if (!url) {
		console.warn(
			`[install-gstreamer] No bundled GStreamer archive available for platform "${platform}". ` +
				"Falling back to system-installed GStreamer.",
		);
		return null;
	}
	return url;
}

async function downloadFile(url, destPath) {
	const { default: https } = await import("node:https");
	const { default: http } = await import("node:http");

	return new Promise((resolve, reject) => {
		const client = url.startsWith("https") ? https : http;

		const follow = (currentUrl, redirectCount = 0) => {
			if (redirectCount > 10) {
				return reject(new Error("Too many redirects"));
			}
			client.get(currentUrl, (res) => {
				if (
					res.statusCode >= 300 &&
					res.statusCode < 400 &&
					res.headers.location
				) {
					return follow(res.headers.location, redirectCount + 1);
				}

				if (res.statusCode !== 200) {
					return reject(
						new Error(
							`Download failed: HTTP ${res.statusCode} for ${currentUrl}`,
						),
					);
				}

				const fileStream = createWriteStream(destPath);
				res.pipe(fileStream);
				fileStream.on("finish", () => {
					fileStream.close();
					resolve();
				});
				fileStream.on("error", reject);
			}).on("error", reject);
		};

		follow(url);
	});
}

async function extractZip(archivePath, destDir) {
	if (process.platform === "win32") {
		execSync(
			`powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`,
			{ stdio: "inherit" },
		);
	} else {
		execSync(`unzip -o "${archivePath}" -d "${destDir}"`, {
			stdio: "inherit",
		});
	}
}

async function extractTarGz(archivePath, destDir) {
	execSync(`tar -xf "${archivePath}" -C "${destDir}"`, {
		stdio: "inherit",
	});
}
// ---------------------------------------------------------------------------
async function main() {
	if (fs.existsSync(SENTINEL)) {
		console.log(
			"[install-gstreamer] Bundled GStreamer already installed, skipping.",
		);
		return;
	}

	const url = getPlatformUrl();
	if (!url) return; 

	console.log(`[install-gstreamer] Downloading GStreamer binaries from:\n  ${url}`);
	fs.mkdirSync(GSTREAMER_DIR, { recursive: true });

	const isZip = url.endsWith(".zip");
	const archiveName = isZip ? "gstreamer-archive.zip" : "gstreamer-archive.tar.gz";
	const archivePath = path.join(GSTREAMER_DIR, archiveName);

	try {
		await downloadFile(url, archivePath);
		console.log("[install-gstreamer] Download complete. Extracting…");

		if (isZip) {
			await extractZip(archivePath, GSTREAMER_DIR);
		} else {
			await extractTarGz(archivePath, GSTREAMER_DIR);
		}

		// Clean up archive
		fs.unlinkSync(archivePath);

		// Drop sentinel
		fs.writeFileSync(SENTINEL, new Date().toISOString(), "utf-8");
		console.log("[install-gstreamer] GStreamer binaries installed successfully.");
	} catch (err) {
		console.error(
			`[install-gstreamer] Failed to install GStreamer binaries: ${err.message}`,
		);
		console.warn(
			"[install-gstreamer] Will fall back to system-installed GStreamer at runtime.",
		);
		try {
			if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
		} catch {}
	}
}

main();
