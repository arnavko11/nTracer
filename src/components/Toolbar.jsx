/**
 * Top bar: app identity, the map-level actions, and a summary of the map.
 *
 * Save/Load land in milestone 4 and Rescan in milestone 5; those buttons stay
 * visibly disabled until then so the layout doesn't shift when they come
 * alive.
 */

export default function Toolbar({
  map,
  scanning,
  elapsed,
  quickScan,
  onQuickScanChange,
  onScan,
}) {
  const deviceCount = map.devices.length;
  const offlineCount = map.devices.filter((d) => d.status === 'offline').length;

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">n</span>Tracer
      </div>

      <div className="toolbar-actions">
        <button type="button" onClick={onScan} disabled={scanning}>
          {scanning ? `Scanning… ${formatElapsed(elapsed)}` : 'Scan'}
        </button>
        <button type="button" disabled title="Coming in milestone 5">Rescan</button>
        <button type="button" disabled title="Coming in milestone 4">Save</button>
        <button type="button" disabled title="Coming in milestone 4">Load</button>

        <label
          className="toolbar-toggle"
          title="Ping sweep only — finds devices without fingerprinting them. Seconds instead of minutes."
        >
          <input
            type="checkbox"
            checked={quickScan}
            disabled={scanning}
            onChange={(event) => onQuickScanChange(event.target.checked)}
          />
          Quick scan
        </label>
      </div>

      <div className="toolbar-status">
        <span>{map.subnet ?? 'no subnet'}</span>
        <span>
          {deviceCount} device{deviceCount === 1 ? '' : 's'}
          {offlineCount > 0 && ` · ${offlineCount} offline`}
        </span>
        <span>last scan {formatTimestamp(map.last_scan)}</span>
      </div>
    </header>
  );
}

/** Seconds → "1:04", so a long scan visibly makes progress. */
function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(seconds % 60).padStart(2, '0')}`;
}

/** ISO-8601 → something readable, without pulling in a date library. */
function formatTimestamp(iso) {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString();
}
