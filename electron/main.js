/**
 * nTracer — Electron main process.
 *
 * Owns the app window and, from milestone 3 on, everything the renderer isn't
 * allowed to do itself: spawning the Python scanner and reading/writing
 * .nettrace files. The renderer talks to it only through the narrow API in
 * preload.js.
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

// `npm run dev` sets this; a packaged build never does.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f1720',
    title: 'nTracer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The renderer runs untrusted-ish third-party code (React Flow and
      // friends), so keep it fully sandboxed and route privileged work
      // through IPC instead.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // macOS: clicking the dock icon with no windows open should reopen one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
