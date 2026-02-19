// src/utils/logger.ts
import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs';

// dynamic log path (similar to logPath() requirement)
const HOMEDIR = os.homedir();
const LOG_DIR = path.join(HOMEDIR, '.rein'); 
const LOG_FILE = path.join(LOG_DIR, 'log.txt');
// Ensure the log directory exists before Winston tries to open the file
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err: any) {
  // If we can't create the log dir, fall back to stderr only — don't crash.
  process.stderr.write(`[logger] Failed to create log directory ${LOG_DIR}: ${err?.message}\n`);
}

// Ensure the logger handles uncaught exceptions and rejections
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'rein-server' },
  transports: [
    // Write all logs with level `info` and below to `log.txt`
    new winston.transports.File({ filename: LOG_FILE }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: LOG_FILE })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: LOG_FILE })
  ]
});

// If we're not in production then log to the `console`
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Optional: Intercept standard console.log and redirect to winston
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const serialize = (a: any): string =>
    typeof a === 'string' ? a : JSON.stringify(a);

console.log = (...args: any[]) => {
    logger.info(args.map(serialize).join(' '));
};

console.error = (...args: any[]) => {
    logger.error(args.map(serialize).join(' '));
};

export default logger;
