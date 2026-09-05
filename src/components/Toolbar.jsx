/**
 * Top bar: app identity plus the map-level actions.
 *
 * The action buttons are wired up in later milestones (3: Scan, 4: Save/Load,
 * 5: Rescan); until then they're visibly disabled rather than absent, so the
 * layout doesn't shift when they come alive.
 */

export default function Toolbar({ map }) {
  const deviceCount = map.devices.length;
  const offlineCount = map.devices.filter((d) => d.status === 'offline').length;

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">n</span>Tracer
      </div>

      <div className="toolbar-actions">
        <button type="button" disabled title="Coming in milestone 3">Scan</button>
        <button type="button" disabled title="Coming in milestone 5">Rescan</button>
        <button type="button" disabled title="Coming in milestone 4">Save</button>
        <button type="button" disabled title="Coming in milestone 4">Load</button>
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

/** ISO-8601 → something readable, without pulling in a date library. */
function formatTimestamp(iso) {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString();
}
