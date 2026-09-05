/**
 * The preload bridge (`window.ntracer`), plus a safe fallback.
 *
 * If preload.js fails to load, every privileged call would otherwise throw
 * from inside a render effect and leave the user with a blank window and no
 * explanation. Instead each call falls back to an error result, so the canvas
 * still comes up and says what's wrong.
 *
 * Calls look `window.ntracer` up at call time rather than at import time, so
 * the app doesn't care whether preload landed before or after the bundle.
 */

export const BRIDGE_UNAVAILABLE =
  'The desktop bridge isn\'t available, so scanning and saving are disabled. '
  + 'This usually means nTracer was opened outside Electron, or that '
  + 'electron/preload.js failed to load.';

/** True if the bridge was there when the app started. Drives the banner. */
export const bridgeAvailable = typeof window !== 'undefined' && Boolean(window.ntracer);

function call(method, args, fallback = { ok: false, error: BRIDGE_UNAVAILABLE }) {
  const api = typeof window !== 'undefined' ? window.ntracer : null;
  if (!api?.[method]) return Promise.resolve(fallback);
  return api[method](...args);
}

export const bridge = {
  scan: (...args) => call('scan', args),
  traceroute: (...args) => call('traceroute', args),
  saveMap: (...args) => call('saveMap', args),
  loadMap: (...args) => call('loadMap', args),
  // Nothing to restore isn't an error worth reporting.
  loadLastMap: (...args) => call('loadLastMap', args, { ok: false }),
};
