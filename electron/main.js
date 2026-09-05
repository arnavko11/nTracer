/**
 * nTracer — Electron main process.
 *
 * Owns the app window and, from milestone 3 on, everything the renderer isn't
 * allowed to do itself: spawning the Python scanner and reading/writing
 * .nettrace files. The renderer talks to it only through the narrow API in
 * preload.js.
 */

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const { runScan } = require('./scanner');
const { saveMap, loadMap, loadLastMap } = require('./mapFiles');

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

/**
 * IPC handlers. Each one mirrors a method exposed in preload.js, and each
 * returns a plain `{ ok, ... }` object so a failure crosses the bridge as
 * data rather than as an exception the renderer has to unwrap.
 */
function registerIpcHandlers() {
  ipcMain.handle('scan:run', async (_event, options) => {
    try {
      return { ok: true, map: await runScan(options) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // File dialogs are parented to the window that asked, so they open as
  // sheets on macOS rather than as detached windows.
  const windowFor = (event) => BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle('map:save', (event, { map, path: currentPath, saveAs }) =>
    saveMap(windowFor(event), map, currentPath, saveAs));

  ipcMain.handle('map:load', (event) => loadMap(windowFor(event)));

  ipcMain.handle('map:load-last', (event) => loadLastMap(windowFor(event)));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // macOS: clicking the dock icon with no windows open should reopen one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
