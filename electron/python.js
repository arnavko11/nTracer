/**
 * Running the Python side of nTracer.
 *
 * Both scripts follow the same contract: they print exactly one JSON object
 * to stdout and nothing else, and report their own failures as
 * `{"error": "..."}`. That lets everything share one runner, and means the
 * only two outcomes a caller has to handle are "object" and "threw".
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

/** Repo root — one level up from electron/. */
const ROOT = path.join(__dirname, '..');

/**
 * Pick the Python that has the project's dependencies installed.
 * Prefers the venv the README tells you to create.
 */
function resolvePython() {
  if (process.env.NTRACER_PYTHON) return process.env.NTRACER_PYTHON;

  const venv = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(venv) ? venv : 'python3';
}

/**
 * Run `python/<script>` and resolve with its parsed JSON output.
 *
 * @param {string} script    filename inside python/
 * @param {string[]} args    arguments to pass
 * @param {number} timeoutMs kill the process after this long
 * @returns {Promise<object>}
 */
function runPython(script, args, timeoutMs) {
  const python = resolvePython();
  const scriptPath = path.join(ROOT, 'python', script);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(python, [scriptPath, ...args], { cwd: ROOT });
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
      reject(new Error(`${script} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

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
        // The scripts report their own failures as JSON, so unparseable
        // output means something went wrong before they got that far.
        reject(new Error(stderr.trim() || `${script} produced no output.`));
        return;
      }

      if (payload.error) reject(new Error(payload.error));
      else resolve(payload);
    });
  });
}

module.exports = { runPython };
