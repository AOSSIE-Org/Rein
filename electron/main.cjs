const { app, BrowserWindow, session, systemPreferences } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;

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

    console.log("Starting server from:", serverPath);

    serverProcess = spawn('node', [serverPath], {
      stdio: 'ignore',       // no terminal
      windowsHide: true,     // hide CMD
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '3000',
      },
    });

    waitForServer('http://localhost:3000').then(resolve);
  });
}

// Create window
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Grant screen-capture permission requests only from the trusted local
  // origin and only for display-capture / screen. Without this handler
  // Electron silently denies getDisplayMedia in packaged builds.
  const TRUSTED_ORIGIN = 'http://localhost:3000';
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const origin = webContents.getURL();
      const isScreenCapture = permission === 'display-capture' || permission === 'screen';
      callback(origin.startsWith(TRUSTED_ORIGIN) && isScreenCapture);
    }
  );

  // Allow permission checks (e.g. navigator.permissions.query) for the same
  // trusted origin and screen-capture permissions only.
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission) => {
      const origin = webContents ? webContents.getURL() : '';
      const isScreenCapture = permission === 'display-capture' || permission === 'screen';
      return origin.startsWith(TRUSTED_ORIGIN) && isScreenCapture;
    }
  );

  mainWindow.loadURL('http://localhost:3000');

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Clear the reference so createWindow() can recreate it (macOS dock reopen)
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Debug only if needed
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.log("LOAD FAILED:", code, desc);
  });
}

// App start
app.whenReady().then(async () => {
  // On macOS, screen-recording permission cannot be requested programmatically
  // via the Electron API (askForMediaAccess does not support 'screen').
  // If the permission has not been granted yet, show a dialog directing the
  // user to enable it in System Preferences → Privacy & Security → Screen Recording.
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      const { dialog } = require('electron');
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Screen Recording Permission Required',
        message: 'Rein needs Screen Recording permission to mirror your display.',
        detail:
          'Please open System Preferences → Privacy & Security → Screen Recording ' +
          'and enable Rein, then restart the app.',
        buttons: ['OK'],
      });
    }
  }

  await startServer();
  createWindow();
});

// Cleanup
app.on('window-all-closed', () => {
  // On macOS the server keeps running so the app can be reopened via the
  // dock without restarting the Nitro process. Only kill the server and
  // quit on platforms where closing all windows means the app is done.
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
  if (!mainWindow) createWindow();
});