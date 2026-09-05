/**
 * Reading and writing .nettrace map files, plus remembering the last one.
 *
 * A .nettrace file is plain JSON (see the README for the schema); the custom
 * extension exists so the OS can associate it with nTracer later.
 *
 * Every function here returns a plain result object rather than throwing, so
 * the IPC layer above can hand it straight to the renderer.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');
const Store = require('electron-store');

const FILE_FILTERS = [
  { name: 'nTracer map', extensions: ['nettrace'] },
  { name: 'JSON', extensions: ['json'] },
];

/** Small persisted settings blob, kept in Electron's userData directory. */
const store = new Store({
  name: 'ntracer',
  defaults: { lastMapPath: null },
});

/**
 * Write a map to disk.
 *
 * Prompts for a location the first time (or when `saveAs` is set); after that
 * it overwrites the known path silently, the way any editor behaves.
 *
 * @returns {Promise<{ok: boolean, path?: string, cancelled?: boolean, error?: string}>}
 */
async function saveMap(window, map, currentPath, saveAs = false) {
  let target = saveAs ? null : currentPath;

  if (!target) {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Save network map',
      defaultPath: currentPath ?? defaultFilename(map),
      filters: FILE_FILTERS,
    });
    if (canceled || !filePath) return { ok: false, cancelled: true };
    target = filePath;
  }

  try {
    // Pretty-printed: these files are meant to be readable and diffable.
    await fs.writeFile(target, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not save: ${err.message}` };
  }

  store.set('lastMapPath', target);
  return { ok: true, path: target };
}

/**
 * Read a map from disk, prompting for a file when no path is given.
 *
 * @returns {Promise<{ok: boolean, map?: object, path?: string, cancelled?: boolean, error?: string}>}
 */
async function loadMap(window, filePath) {
  let target = filePath;

  if (!target) {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Open network map',
      properties: ['openFile'],
      filters: FILE_FILTERS,
    });
    if (canceled || filePaths.length === 0) return { ok: false, cancelled: true };
    [target] = filePaths;
  }

  let map;
  try {
    map = JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (err) {
    return { ok: false, error: `Could not open ${path.basename(target)}: ${err.message}` };
  }

  const problem = validateMap(map);
  if (problem) {
    return { ok: false, error: `${path.basename(target)} is not a valid map: ${problem}` };
  }

  store.set('lastMapPath', target);
  return { ok: true, map, path: target };
}

/**
 * Reopen whatever was last saved or opened, so launching the app shows your
 * network immediately instead of an empty canvas.
 *
 * A missing file isn't an error — it just means nothing to restore (the map
 * was moved or deleted since last time), so the stored path is cleared.
 *
 * @returns {Promise<{ok: boolean, map?: object, path?: string}>}
 */
async function loadLastMap(window) {
  const lastPath = store.get('lastMapPath');
  if (!lastPath) return { ok: false };

  const result = await loadMap(window, lastPath);
  if (!result.ok) store.set('lastMapPath', null);
  return result;
}

/** Enough of a check to catch "you opened the wrong file", not a full schema. */
function validateMap(map) {
  if (!map || typeof map !== 'object') return 'not a JSON object';
  if (!Array.isArray(map.devices)) return 'missing a "devices" array';
  return null;
}

/** e.g. "192.168.1.0-24.nettrace", or a dated name when there's no subnet. */
function defaultFilename(map) {
  const base = map?.subnet
    ? map.subnet.replace('/', '-')
    : `network-${new Date().toISOString().slice(0, 10)}`;
  return `${base}.nettrace`;
}

module.exports = { saveMap, loadMap, loadLastMap };
