import fs   from 'fs';
import os   from 'os';
import path from 'path';

const APP_NAME    = 'rein';
const MAX_BYTES   = 10 * 1024 * 1024;
const MAX_ROTATED = 5;

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO:  20,
    WARN:  30,
    ERROR: 40,
};

function resolveLogPath(): string {
    if (process.env.LOG_FILE_PATH) {
        return path.resolve(process.env.LOG_FILE_PATH);
    }
    if (process.env.LOG_DIR) {
        return path.join(path.resolve(process.env.LOG_DIR), `${APP_NAME}.log`);
    }

    const home = os.homedir();

    if (process.platform === 'win32') {
        const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
        return path.join(appData, `.${APP_NAME}`, 'log.txt');
    }

    return path.join(home, `.${APP_NAME}`, 'log.txt');
}

function maybeRotate(logPath: string): void {
    try {
        if (fs.statSync(logPath).size < MAX_BYTES) return;
    } catch {
        return;
    }

    for (let i = MAX_ROTATED - 1; i >= 1; i--) {
        const src  = `${logPath}.${i}`;
        const dest = `${logPath}.${i + 1}`;
        try { if (fs.existsSync(src)) fs.renameSync(src, dest); } catch { /* */ }
    }
    try { fs.renameSync(logPath, `${logPath}.1`); } catch { /* */ }
}

class Logger {
    private logPath:    string;
    private stream:     fs.WriteStream | null = null;
    private initialized = false;
    private fileLevel   = LEVELS.DEBUG;
    private stdoutLevel = LEVELS.WARN;

    constructor() {
        this.logPath = resolveLogPath();
    }

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
        maybeRotate(this.logPath);

        this.stream = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf-8' });
        this.stream.on('error', (err) => {
            process.stderr.write(`[rein-logger] stream error: ${err.message}\n`);
        });

        this.writeSessionHeader();
        this.hookProcessEvents();
        this.info(`Log file: ${this.logPath}`);
    }

    getLogPath(): string { return this.logPath; }

    debug(...args: unknown[]): void { this.write('DEBUG', args); }
    info(...args: unknown[]): void  { this.write('INFO',  args); }
    warn(...args: unknown[]): void  { this.write('WARN',  args); }
    error(...args: unknown[]): void { this.write('ERROR', args); }

    private write(level: LogLevel, args: unknown[]): void {
        const ts      = new Date().toISOString();
        const message = args.map(a =>
            typeof a === 'object' ? safeStringify(a) : String(a)
        ).join(' ');
        const line = `[${ts}] [${level.padEnd(5)}] ${message}\n`;

        if (this.stream && !this.stream.destroyed && LEVELS[level] >= this.fileLevel) {
            this.stream.write(line);
        }
        if (LEVELS[level] >= this.stdoutLevel) {
            process.stdout.write(line);
        }
    }

    private writeSync(text: string): void {
        try {
            const fd = (this.stream as unknown as { fd: number }).fd;
            if (typeof fd === 'number' && fd >= 0) fs.writeSync(fd, text);
        } catch { /* */ }
    }

    private writeSessionHeader(): void {
        const sep  = '─'.repeat(72);
        const meta = [`Node ${process.version}`, `PID ${process.pid}`, process.platform, os.hostname()].join(' · ');
        this.stream?.write(`\n${sep}\n`);
        this.stream?.write(`SESSION STARTED  ${new Date().toISOString()}\n`);
        this.stream?.write(`${meta}\n`);
        this.stream?.write(`${sep}\n`);
    }

    private writeSessionFooterSync(): void {
        const sep = '─'.repeat(72);
        this.writeSync(`\n${sep}\n`);
        this.writeSync(`SESSION ENDED    ${new Date().toISOString()}\n`);
        this.writeSync(`${sep}\n\n`);
    }

    close(): void {
        if (!this.stream) return;
        this.writeSessionFooterSync();
        try { this.stream.destroy(); } catch { /* */ }
        this.stream      = null;
        this.initialized = false;
    }

    private hookProcessEvents(): void {
        process.on('uncaughtException', (err) => {
            this.writeSync(`[${new Date().toISOString()}] [ERROR] [UncaughtException] ${err?.stack ?? err}\n`);
            this.close();
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            const msg = reason instanceof Error ? reason.stack : safeStringify(reason);
            this.write('ERROR', [`[UnhandledRejection] ${msg}`]);
        });

        const shutdown = () => { this.close(); process.exit(0); };
        process.once('SIGINT',  shutdown);
        process.once('SIGTERM', shutdown);
        process.once('exit',    () => this.close());
    }
}

function safeStringify(obj: unknown): string {
    const seen = new WeakSet();
    try {
        return JSON.stringify(obj, (_, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value as unknown;
        }, 2);
    } catch {
        return String(obj);
    }
}

export const logger = new Logger();