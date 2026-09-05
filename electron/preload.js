/**
 * Bridge between the sandboxed renderer and the main process.
 *
 * Everything the React app can ask the OS to do is listed here explicitly —
 * nothing else from Node reaches the renderer. Milestones 3-6 fill this in
 * with scan / save / load / traceroute; for now it only reports the version so
 * the renderer can confirm the bridge is live.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ntracer', {
  version: process.env.npm_package_version || '0.1.0',
});
