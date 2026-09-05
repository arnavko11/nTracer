/**
 * Bridge between the sandboxed renderer and the main process.
 *
 * Everything the React app can ask the OS to do is listed here explicitly —
 * nothing else from Node reaches the renderer. Milestone 6 adds traceroute.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ntracer', {
  /**
   * Run a network scan.
   * @param {{subnet?: string, discoverOnly?: boolean}} options
   * @returns {Promise<{ok: true, map: object} | {ok: false, error: string}>}
   */
  scan: (options) => ipcRenderer.invoke('scan:run', options ?? {}),

  /**
   * Write a map to disk. Prompts for a location when `path` is null or
   * `saveAs` is set; otherwise overwrites `path` silently.
   * @returns {Promise<{ok: boolean, path?: string, cancelled?: boolean, error?: string}>}
   */
  saveMap: (map, path, saveAs = false) =>
    ipcRenderer.invoke('map:save', { map, path, saveAs }),

  /**
   * Prompt for a .nettrace file and read it.
   * @returns {Promise<{ok: boolean, map?: object, path?: string, cancelled?: boolean, error?: string}>}
   */
  loadMap: () => ipcRenderer.invoke('map:load'),

  /**
   * Reopen the last saved/opened map, if it still exists.
   * @returns {Promise<{ok: boolean, map?: object, path?: string}>}
   */
  loadLastMap: () => ipcRenderer.invoke('map:load-last'),
});
