/**
 * Side panel for the selected device: everything the scan found, plus the
 * traceroute control.
 *
 * On a home LAN a trace is nearly always one hop, and that's the useful
 * answer — it confirms the device is reachable through the router and shows
 * the latency to it. Multi-hop results (tracing something off-network) render
 * the same way.
 */

export default function DeviceDetails({
  device,
  trace,
  tracing,
  traceError,
  onTrace,
  onClose,
}) {
  if (!device) return null;

  const isThisTrace = trace?.deviceId === device.id;

  return (
    <aside className="details">
      <div className="details-head">
        <h2 title={device.label}>{device.label}</h2>
        <button type="button" className="banner-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <dl className="details-grid">
        <Field label="IP" value={device.ip} mono />
        <Field label="MAC" value={device.mac || '—'} mono />
        <Field label="Vendor" value={device.vendor || 'unknown'} />
        <Field label="OS guess" value={device.os_guess} />
        <Field label="Status" value={device.status} />
        <Field label="Scan profile" value={device.scan_profile} />
        <Field
          label="Open ports"
          value={device.open_ports?.length ? device.open_ports.join(', ') : 'none found'}
          mono
        />
        <Field label="First seen" value={formatTimestamp(device.first_seen)} />
        <Field label="Last seen" value={formatTimestamp(device.last_seen)} />
      </dl>

      {device.notes && <p className="details-notes">{device.notes}</p>}

      <div className="details-actions">
        <button type="button" onClick={() => onTrace(device)} disabled={tracing}>
          {tracing ? 'Tracing…' : 'Trace route'}
        </button>
      </div>

      {traceError && <p className="details-error">{traceError}</p>}

      {isThisTrace && <HopTable trace={trace} />}
    </aside>
  );
}

/** The hop-by-hop result, newest trace only. */
function HopTable({ trace }) {
  return (
    <div className="hops">
      <div className="hops-head">
        {trace.hops.length} hop{trace.hops.length === 1 ? '' : 's'}
        {!trace.reached && <span className="tag tag-offline">no route</span>}
      </div>

      <table>
        <tbody>
          {trace.hops.map((hop) => (
            <tr key={hop.hop} className={hop.timed_out ? 'hop-timeout' : undefined}>
              <td className="hop-number">{hop.hop}</td>
              <td className="hop-ip">{hop.ip ?? '*'}</td>
              <td className="hop-rtt">
                {hop.timed_out ? 'no reply' : `${hop.avg_ms} ms`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value}</dd>
    </>
  );
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
