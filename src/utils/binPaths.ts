import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function resolveProjectRoot(): string {
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

export function resolveBundledBin(
	subdir: string,
	filename: string,
): string | null {
	const candidates: string[] = []

	// Electron production resourcesPath (set by electron-builder extraResources)
	const resourcesPath = (process as unknown as { resourcesPath?: string })
		.resourcesPath
	if (resourcesPath) {
		candidates.push(
			path.join(resourcesPath, "bin", subdir, filename),
			path.join(resourcesPath, subdir, filename),
		)
	}

	const projectRoot = resolveProjectRoot()
	candidates.push(path.join(projectRoot, "bin", subdir, filename))
	candidates.push(path.join(process.cwd(), "bin", subdir, filename))

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate
		}
	}

	return null
}
