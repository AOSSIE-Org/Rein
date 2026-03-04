import winston from "winston"

const logger = winston.createLogger({
	level: "info",

	// 📁 FILE: logs everything including debug
	transports: [
		new winston.transports.File({
			filename: "logs/error.log",
			level: "error", // only errors in error.log
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.json(), // structured JSON for files
			),
		}),
		new winston.transports.File({
			filename: "logs/combined.log",
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.json(),
			),
		}),
	],
})

// 🖥️ CONSOLE: only in development, human readable
if (process.env.NODE_ENV !== "production") {
	logger.add(
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.simple(), // readable format for console
			),
		}),
	)
}

export { logger }
