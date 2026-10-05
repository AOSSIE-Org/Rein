import { spawn } from "node:child_process"
import os from "node:os"

/**
 * Helper to run a command and write text into its stdin safely.
 */
function spawnWithStdin(
	cmd: string,
	args: string[],
	input: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] })

		child.stdin.on("error", (err) => {
			if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
				reject(err)
			}
		})

		child.on("error", reject)

		child.on("close", (code) => {
			if (code === 0) resolve()
			else reject(new Error(`${cmd} exited with code ${code}`))
		})

		child.stdin.end(input, "utf-8")
	})
}

/**
 * Helper to run a command and capture its stdout.
 */
function spawnCaptureOutput(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] })
		let output = ""

		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString("utf-8")
		})

		child.on("error", reject)

		child.on("close", (code) => {
			if (code === 0) resolve(output)
			else reject(new Error(`${cmd} exited with code ${code}`))
		})
	})
}

/**
 * Read the host system clipboard as plain text.
 */
export async function getSystemClipboard(): Promise<string> {
	const platform = os.platform()

	if (platform === "darwin") {
		return await spawnCaptureOutput("pbpaste", [])
	}

	if (platform === "win32") {
		const text = await spawnCaptureOutput("powershell.exe", [
			"-NoProfile",
			"-Command",
			"Get-Clipboard -Raw",
		])
		return text.replace(/\r?\n$/, "")
	}

	// Linux: Check Wayland first, then fall back to xclip / xsel
	if (process.env.XDG_SESSION_TYPE === "wayland") {
		try {
			return await spawnCaptureOutput("wl-paste", ["--no-newline"])
		} catch {}
	}

	try {
		return await spawnCaptureOutput("xclip", ["-selection", "clipboard", "-o"])
	} catch {}

	return await spawnCaptureOutput("xsel", ["--clipboard", "--output"])
}

/**
 * Write text to the host system clipboard.
 */
export async function setSystemClipboard(text: string): Promise<void> {
	const platform = os.platform()

	if (platform === "darwin") {
		await spawnWithStdin("pbcopy", [], text)
		return
	}

	if (platform === "win32") {
		// Read safely from stdin in PowerShell without shell command injection
		await spawnWithStdin(
			"powershell.exe",
			[
				"-NoProfile",
				"-Command",
				"[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
			],
			text,
		)
		return
	}

	// Linux: Try Wayland wl-copy, fallback to xclip, then xsel
	if (process.env.XDG_SESSION_TYPE === "wayland") {
		try {
			await spawnWithStdin("wl-copy", [], text)
			return
		} catch {}
	}

	try {
		await spawnWithStdin("xclip", ["-selection", "clipboard"], text)
		return
	} catch {}

	await spawnWithStdin("xsel", ["--clipboard", "--input"], text)
}
