const { app, BrowserWindow, utilityProcess, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let serverProcess;
let serverHost = '0.0.0.0';
let serverPort = 3000;

  // Log file
  const logPath = path.join(path.dirname(process.execPath), 'rein-server.log');
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    try { fs.appendFileSync(logPath, line); } catch (_) {}
  };
// Load server config (port/host overrides)
try {
  const userDataDir = app.getPath('userData');
  const candidates = [
    path.join(userDataDir, 'server-config.json'),
    process.resourcesPath && path.join(process.resourcesPath, 'src', 'server-config.json'),
    path.join(__dirname, '..', 'src', 'server-config.json'),
    path.join(process.cwd(), 'src', 'server-config.json'),
  ].filter(Boolean);

  for (const configPath of candidates) {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.host) serverHost = config.host;
      if (config.frontendPort) serverPort = config.frontendPort;
      break;
    }
  }
} catch (e) {}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

function waitForServer(url, timeoutMs = 30000, requestTimeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      fn(val);
    };

    const deadlineTimer = setTimeout(() => {
      settle(reject, new Error(`Server did not respond within ${timeoutMs}ms`));
    }, timeoutMs);

    const check = () => {
      if (settled) return;
      const req = http.get(url, () => settle(resolve));
      req.setTimeout(requestTimeoutMs, () => req.destroy());
      req.on('error', () => {
        if (!settled) setTimeout(check, 500);
      });
    };
    check();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      '.output',
      'server',
      'index.mjs'
    );

    if (!fs.existsSync(serverPath)) {
      const msg = `Server not found: ${serverPath}`;
      log(`[ERROR] ${msg}`);
      return reject(new Error(msg));
    }

    log(`Starting server: ${serverPath}`);

    serverProcess = utilityProcess.fork(serverPath, [], {
      stdio: 'pipe',
      env: {
        ...process.env,
        HOST: serverHost,
        PORT: serverPort.toString(),
        REIN_DATA_DIR: app.getPath('userData'),
      },
    });

    let serverLog = '';
    const append = (chunk) => {
      serverLog += chunk;
      process.stdout.write(chunk);
      try { fs.appendFileSync(logPath, chunk); } catch (_) {}
    };

    if (serverProcess.stdout) serverProcess.stdout.on('data', d => append(d.toString()));
    if (serverProcess.stderr) serverProcess.stderr.on('data', d => append(d.toString()));

    // Track whether waitForServer has already signalled readiness so the exit
    // handler can distinguish a post-ready crash from a pre-ready crash.
    let ready = false;

    serverProcess.on('exit', (code) => {
      log(`Server exited with code ${code}`);
      try {
        fs.writeFileSync(
          path.join(path.dirname(process.execPath), 'server-crash.log'),
          `Exit code: ${code}\n\n${serverLog}`
        );
      } catch (_) {}
      // Reject startServer if the process died before becoming ready, giving
      // the caller the real exit code rather than a generic timeout message.
      if (!ready) {
        reject(new Error(`Server process exited with code ${code} before becoming ready`));
      }
    });

    waitForServer(`http://localhost:${serverPort}`, 30000)
      .then(() => { ready = true; resolve(); })
      .catch(reject);
  });
}

function createWindow() {
  if (mainWindow) return;

  const iconPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    '.output',
    'public',
    'app_icon',
    'Icon512.png'
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    process.stdout.write(`[LOAD FAILED] ${code} ${desc}\n`);
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    process.stdout.write(`[FATAL] Server failed to start: ${err.message}\n`);
    dialog.showErrorBox('Rein failed to start', err.message);
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});