
import fs from 'fs';
import os from 'os';
import path from 'path';


const APP_NAME        = 'rein';
const MAX_BYTES       = 10 * 1024 * 1024; 
const MAX_ROTATED     = 5;               

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
        return path.join(appData, APP_NAME, 'logs', `${APP_NAME}.log`);
    }

    const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
    return path.join(xdgConfig, APP_NAME, 'logs', `${APP_NAME}.log`);
}


function maybeRotate(logPath: string): void {
    try {
        const stat = fs.statSync(logPath);
        if (stat.size < MAX_BYTES) return;
    } catch {
        return; 
    }

    for (let i = MAX_ROTATED - 1; i >= 1; i--) {
        const src  = `${logPath}.${i}`;
        const dest = `${logPath}.${i + 1}`;
        try { if (fs.existsSync(src)) fs.renameSync(src, dest); } catch { /* best-effort */ }
    }

    try { fs.renameSync(logPath, `${logPath}.1`); } catch { /* best-effort */ }
}


class Logger {
    private logPath: string;
    private stream:  fs.WriteStream | null = null;
    private originals: Partial<typeof console> = {};

    constructor() {
        this.logPath = resolveLogPath();
    }


    init(): void {
        fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
        maybeRotate(this.logPath);

        this.stream = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf-8' });
        this.stream.on('error', (err) => {
            process.stderr.write(`[rein-logger] stream error: ${err.message}\n`);
        });

        this.writeSessionHeader();
        this.patchConsole();
        this.hookProcessEvents();
    }

    close(): void {
        this.writeSessionFooter();
        this.restoreConsole();
        this.stream?.end();
        this.stream = null;
    }


    getLogPath(): string {
        return this.logPath;
    }
    private write(level: string, args: unknown[]): void {
        if (!this.stream || this.stream.destroyed) return;

        const ts      = new Date().toISOString();
        const message = args.map(a =>
            typeof a === 'object' ? safeStringify(a) : String(a)
        ).join(' ');

        this.stream.write(`[${ts}] [${level.padEnd(5)}] ${message}\n`);
    }

    private writeSessionHeader(): void {
        const sep  = '─'.repeat(72);
        const meta = [
            `Node ${process.version}`,
            `PID ${process.pid}`,
            process.platform,
            os.hostname(),
        ].join(' · ');

        this.stream?.write(`\n${sep}\n`);
        this.stream?.write(`SESSION STARTED  ${new Date().toISOString()}\n`);
        this.stream?.write(`${meta}\n`);
        this.stream?.write(`Log → ${this.logPath}\n`);
        this.stream?.write(`${sep}\n`);
    }

    private writeSessionFooter(): void {
        const sep = '─'.repeat(72);
        this.stream?.write(`\n${sep}\n`);
        this.stream?.write(`SESSION ENDED    ${new Date().toISOString()}\n`);
        this.stream?.write(`${sep}\n\n`);
    }

    private patchConsole(): void {
        const self = this;

        const methods = [
            { name: 'log'   as const, level: 'LOG'   },
            { name: 'info'  as const, level: 'INFO'  },
            { name: 'warn'  as const, level: 'WARN'  },
            { name: 'error' as const, level: 'ERROR' },
            { name: 'debug' as const, level: 'DEBUG' },
        ] as const;

        for (const { name, level } of methods) {
           
            this.originals[name] = console[name].bind(console);

            console[name] = (...args: unknown[]) => {
                self.write(level, args);
                (self.originals[name] as (...a: unknown[]) => void)(...args);
            };
        }
    }

    private restoreConsole(): void {
        Object.assign(console, this.originals);
        this.originals = {};
    }

    private hookProcessEvents(): void {
        process.on('uncaughtException', (err) => {
            this.write('ERROR', [`[UncaughtException] ${err?.stack ?? err}`]);
            this.close();
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            const msg = reason instanceof Error ? reason.stack : safeStringify(reason);
            this.write('ERROR', [`[UnhandledRejection] ${msg}`]);
        });

        const shutdown = () => {
            this.close();
            process.exit(0);
        };

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