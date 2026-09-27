import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Read the host system clipboard as plain text.
 * Returns "" if the clipboard is empty or unsupported.
 */
export async function getSystemClipboard(): Promise<string> {
	const platform = process.platform

	try {
		if (platform === "darwin") {
			const { stdout } = await execAsync("pbpaste")
			return stdout
		}
		if (platform === "win32") {
			const { stdout } = await execAsync(
				'powershell -NoProfile -Command "Get-Clipboard -Raw"',
			)
			return stdout.replace(/\r?\n$/, "")
		}
		// Linux
		const { stdout } = await execAsync(
			"xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null || wl-paste 2>/dev/null",
		)
		return stdout
	} catch {
		return ""
	}
}

/**
 * Write text to the host system clipboard.
 */
export async function setSystemClipboard(text: string): Promise<void> {
	const platform = process.platform

	if (platform === "darwin") {
		await execAsync("pbcopy", { input: text } as never).catch(() => {})
		return
	}
	if (platform === "win32") {
		// Use PowerShell Set-Clipboard, escaping single quotes
		const escaped = text.replace(/'/g, "''")
		await execAsync(
			`powershell -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`,
		).catch(() => {})
		return
	}
	// Linux
	await execAsync(
		"xclip -selection clipboard 2>/dev/null || xsel --clipboard --input 2>/dev/null || wl-copy 2>/dev/null",
		{ input: text } as never,
	).catch(() => {})
}
