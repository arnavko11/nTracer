/**
 * Network discovery: runs python/scan.py and hands back the parsed map.
 */

const { runPython } = require('./python');

/** A /24 with full fingerprinting can genuinely take several minutes. */
const SCAN_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * @param {object} options
 * @param {string} [options.subnet]        CIDR to scan; omit to auto-detect.
 * @param {boolean} [options.discoverOnly] Ping sweep only — much faster.
 * @returns {Promise<object>} the parsed .nettrace-shaped map
 */
function runScan({ subnet, discoverOnly } = {}) {
  const args = [];
  if (subnet) args.push('--subnet', subnet);
  if (discoverOnly) args.push('--discover-only');

  return runPython('scan.py', args, SCAN_TIMEOUT_MS);
}

module.exports = { runScan };
