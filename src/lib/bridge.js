/**
 * The preload bridge (`window.ntracer`), plus a safe fallback.
 *
 * If preload.js fails to load, every privileged call would otherwise throw
 * from inside a render effect and leave the user with a blank window and no
 * explanation. Instead we substitute a stub that reports the problem, so the
 * canvas still comes up and says what's wrong.
 */

export const bridgeAvailable = typeof window !== 'undefined' && Boolean(window.ntracer);

const UNAVAILABLE = {
  ok: false,
  error: 'The desktop bridge isn\'t available, so scanning and saving are '
    + 'disabled. This usually means nTracer was opened outside Electron, or '
    + 'that electron/preload.js failed to load.',
};

const stub = {
  scan: async () => UNAVAILABLE,
  saveMap: async () => UNAVAILABLE,
  loadMap: async () => UNAVAILABLE,
  loadLastMap: async () => ({ ok: false }),
};

export const bridge = bridgeAvailable ? window.ntracer : stub;
