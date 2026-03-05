const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let serverProcess;

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Optimize memory usage
app.commandLine.appendSwitch('--max_old_space_size', '512');
app.commandLine.appendSwitch('--optimize-for-size');

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

// Start Nitro server (production)
function startServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      '.output',
      'server',
      'index.mjs'
    );

    // Fallback to development path if needed
    const fallbackPath = path.join(__dirname, '..', '.output', 'server', 'index.mjs');
    const actualPath = fs.existsSync(serverPath) ? serverPath : fallbackPath;

    serverProcess = spawn('node', [actualPath], {
      stdio: 'ignore',       // no terminal
      windowsHide: true,     // hide CMD
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '3000',
        NODE_ENV: 'production',
        // Memory optimization
        NODE_OPTIONS: '--max-old-space-size=256'
      },
    });

    waitForServer('http://localhost:3000').then(resolve);
  });
}

// Create window with optimizations
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Memory optimizations
      v8CacheOptions: 'code',
      backgroundThrottling: false
    },
    // Performance optimizations  
    useContentSize: true,
    thickFrame: false
  });

  mainWindow.loadURL('http://localhost:3000');

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Optimize memory on hide
  mainWindow.on('hide', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.executeJavaScript(`
        if (window.gc) { 
          window.gc(); 
        }
      `);
    }
  });

  // Debug only if needed (removed in production)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
      console.log("LOAD FAILED:", code, desc);
    });
  }
}

// App start
app.whenReady().then(async () => {
  await startServer();
  createWindow();
});

// Cleanup
app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Memory cleanup on app quit
app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.removeAllListeners();
    mainWindow = null;
  }
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
});

// Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});