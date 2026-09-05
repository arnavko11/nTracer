/**
 * Top bar: app identity, the map-level actions, and a summary of the map.
 */

export default function Toolbar({
  map,
  filePath,
  dirty,
  scanning,
  elapsed,
  quickScan,
  onQuickScanChange,
  onScan,
  onRescan,
  onSave,
  onLoad,
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
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          title="Scan again and merge into this map — keeps your layout, marks missing devices offline"
        >
          Rescan
        </button>
        <button
          type="button"
          onClick={() => onSave(false)}
          title="Save (⌘S) — ⇧⌘S to save a copy elsewhere"
        >
          Save
        </button>
        <button type="button" onClick={onLoad} title="Open a .nettrace map (⌘O)">
          Load
        </button>

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
        <span className="file-name" title={filePath ?? 'Not saved to a file yet'}>
          {filePath ? basename(filePath) : 'unsaved'}
          {dirty && <span className="dirty-dot" title="Unsaved changes">•</span>}
        </span>
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

/** Last path segment, without pulling Node's path module into the renderer. */
function basename(filePath) {
  return filePath.split(/[\\/]/).pop();
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
