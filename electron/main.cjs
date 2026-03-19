const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let serverProcess;
let serverHost = '0.0.0.0';
let serverPort = 3000;

// Load config if exists
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

// Wait until server is ready (with retry limit)
function waitForServer(url, maxRetries = 20, delay = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            console.log('✅ Server is ready');
            resolve();
          } else {
            retry();
          }
        })
        .on('error', retry);
    };

    const retry = () => {
      retries++;
      console.log(`Waiting for server... (${retries}/${maxRetries})`);

      if (retries >= maxRetries) {
        return reject(
          new Error(`Server failed to start after ${maxRetries} attempts`)
        );
      }

      setTimeout(check, delay);
    };

    check();
  });
}

// Start Nitro server
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      '.output',
      'server',
      'index.mjs'
    );

    console.log('Starting server from:', serverPath);

    serverProcess = spawn('node', [serverPath], {
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        HOST: serverHost,
        PORT: serverPort.toString(),
      },
    });

    // Detect early crash
    let resolved = false;

    serverProcess.once('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Nitro server exited early with code ${code}`));
      }
    });

    waitForServer(`http://localhost:${serverPort}`)
      .then(() => {
        resolved = true;
        resolve();
      })
      .catch(reject);
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.log('LOAD FAILED:', code, desc);
  });
}

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  app.quit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// App start
app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    app.quit();
  }
});

// Cleanup on window close
app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  if (process.platform !== 'darwin') app.quit();
});