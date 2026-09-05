/**
 * Bridge between the sandboxed renderer and the main process.
 *
 * Everything the React app can ask the OS to do is listed here explicitly —
 * nothing else from Node reaches the renderer. Milestones 4-6 add
 * save / load / traceroute.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ntracer', {
  /**
   * Run a network scan.
   * @param {{subnet?: string, discoverOnly?: boolean}} options
   * @returns {Promise<{ok: true, map: object} | {ok: false, error: string}>}
   */
  scan: (options) => ipcRenderer.invoke('scan:run', options ?? {}),
});
