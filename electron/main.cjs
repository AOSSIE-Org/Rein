const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let serverProcess;
let serverHost = '0.0.0.0';
let serverPort = 3000;

try {
  const configPath = './src/server-config.json';
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.host) serverHost = config.host;
    if (config.frontendPort) serverPort = config.frontendPort;
  }
} catch (e) {
  console.warn('Failed to load server config:', e);
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Wait until server is ready
function waitForServer(url) {
  return new Promise((resolve) => {
    const check = () => {
      http
        .get(url, () => resolve())
        .on('error', () => setTimeout(check, 500));
    };
    check();
  });
}

// Start Nitro server (development or production)
function startServer() {
  return new Promise((resolve) => {
    // Try development path first (after npm run build)
    const devPath = path.join(process.cwd(), '.output', 'server', 'index.mjs');

    // Fallback to production path (after npm run dist)
    const prodPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      '.output',
      'server',
      'index.mjs'
    );

    // Determine which path to use
    let serverPath;
    let isDevelopment = false;

    if (fs.existsSync(devPath)) {
      serverPath = devPath;
      isDevelopment = true;
      console.log("Starting server in DEVELOPMENT mode from:", serverPath);
    } else if (fs.existsSync(prodPath)) {
      serverPath = prodPath;
      console.log("Starting server in PRODUCTION mode from:", serverPath);
    } else {
      console.error("ERROR: Server build not found!");
      console.error("Tried development path:", devPath);
      console.error("Tried production path:", prodPath);
      console.error("Please run 'npm run build' first.");
      app.quit();
      return;
    }

    serverProcess = spawn('node', [serverPath], {
      stdio: isDevelopment ? 'inherit' : 'ignore',  // show logs in dev
      windowsHide: !isDevelopment,                  // show terminal in dev
      env: {
        ...process.env,
        HOST: serverHost,
        PORT: serverPort.toString(),
      },
    });

    waitForServer(`http://localhost:${serverPort}`).then(resolve);
  });
}

// Create window
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Debug only if needed
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.log("LOAD FAILED:", code, desc);
  });
}

// App start
app.whenReady().then(async () => {
  await startServer();
  createWindow();
});

// Cleanup
app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});