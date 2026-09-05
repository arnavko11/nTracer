/**
 * Runs python/scan.py and hands back the parsed result.
 *
 * The contract with the Python side is deliberately narrow: it prints exactly
 * one JSON object to stdout and nothing else. Anything on stderr is treated as
 * diagnostics, and a `{"error": ...}` payload is turned into a rejected
 * promise so the renderer only ever sees "map" or "error".
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

/** A /24 with full fingerprinting can genuinely take several minutes. */
const SCAN_TIMEOUT_MS = 15 * 60 * 1000;

/** Repo root — one level up from electron/. */
const ROOT = path.join(__dirname, '..');

/**
 * Pick the Python that has python-nmap installed.
 * Prefers the project venv, since that's what the README tells you to create.
 */
function resolvePython() {
  if (process.env.NTRACER_PYTHON) return process.env.NTRACER_PYTHON;

  const venv = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(venv) ? venv : 'python3';
}

/**
 * Spawn a scan.
 *
 * @param {object} options
 * @param {string} [options.subnet]        CIDR to scan; omit to auto-detect.
 * @param {boolean} [options.discoverOnly] Ping sweep only — much faster.
 * @returns {Promise<object>} the parsed .nettrace-shaped map
 */
function runScan({ subnet, discoverOnly } = {}) {
  const python = resolvePython();
  const script = path.join(ROOT, 'python', 'scan.py');

  const args = [script];
  if (subnet) args.push('--subnet', subnet);
  if (discoverOnly) args.push('--discover-only');

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(python, args, { cwd: ROOT });
    } catch (err) {
      reject(new Error(`Could not start ${python}: ${err.message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Scan timed out after ${SCAN_TIMEOUT_MS / 60000} minutes.`));
    }, SCAN_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not run ${python}: ${err.message}`));
    });

    child.on('close', () => {
      clearTimeout(timer);

      let payload;
      try {
        payload = JSON.parse(stdout);
      } catch {
        // scan.py reports its own failures as JSON, so unparseable output
        // means something went wrong before it got that far.
        reject(new Error(
          stderr.trim() || 'Scanner produced no output. Is nmap installed?',
        ));
        return;
      }

      if (payload.error) {
        reject(new Error(payload.error));
        return;
      }
      resolve(payload);
    });
  });
}

module.exports = { runScan };
