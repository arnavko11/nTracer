/**
 * Path tracing: runs python/traceroute.py against one device.
 */

const { runPython } = require('./python');

/** python/traceroute.py caps itself well below this. */
const TRACE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * @param {string} target IP address to trace
 * @returns {Promise<{target: string, reached: boolean, hops: object[]}>}
 */
function runTraceroute(target) {
  if (!target) return Promise.reject(new Error('No address to trace.'));
  return runPython('traceroute.py', [target], TRACE_TIMEOUT_MS);
}

module.exports = { runTraceroute };
