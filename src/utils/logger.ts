// src/utils/logger.ts

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import winston from "winston"

// dynamic log path (similar to logPath() requirement)
const HOMEDIR = os.homedir()
const LOG_DIR = path.join(HOMEDIR, ".rein")
const LOG_FILE = path.join(LOG_DIR, "log.txt")
// Ensure the log directory exists before Winston tries to open the file
try {
	fs.mkdirSync(LOG_DIR, { recursive: true })
} catch (err: unknown) {
	// If we can't create the log dir, fall back to stderr only — don't crash.
	process.stderr.write(
		`[logger] Failed to create log directory ${LOG_DIR}: ${err instanceof Error ? err.message : String(err)}\n`,
	)
}

import { loadServerConfig } from "./configHelper.ts"

// Read verboseLogs flag from server-config.json (defaults to false if missing/unreadable)
const serverConfig = loadServerConfig()
const verboseLogs = serverConfig.verboseLogs === true

// Ensure the logger handles uncaught exceptions and rejections
const logger = winston.createLogger({
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp({
			format: "YYYY-MM-DD HH:mm:ss",
		}),
		winston.format.errors({ stack: true }),
		winston.format.splat(),
		winston.format.json(),
	),
	defaultMeta: { service: "rein-server" },
	transports: [
		// Write all logs with level `info` and below to `log.txt`
		new winston.transports.File({ filename: LOG_FILE }),
	],
	exceptionHandlers: [new winston.transports.File({ filename: LOG_FILE })],
	rejectionHandlers: [new winston.transports.File({ filename: LOG_FILE })],
})

// Only print to terminal when verboseLogs is explicitly enabled in server-config.json
if (verboseLogs) {
	logger.add(
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.simple(),
			),
		}),
	)
}

// Optional: Intercept standard console.log and redirect to winston
const serialize = (a: unknown): string =>
	typeof a === "string" ? a : JSON.stringify(a)

console.log = (...args: unknown[]) => {
	logger.info(args.map(serialize).join(" "))
}

console.error = (...args: unknown[]) => {
	logger.error(args.map(serialize).join(" "))
}

export default logger
