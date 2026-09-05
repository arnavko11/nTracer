/**
 * A single device on the topology canvas.
 *
 * React Flow renders this for every node of type "device"; `data` is the full
 * device object from the .nettrace map.
 */

import { Handle, Position } from 'reactflow';

/** Emoji standing in for proper icons — swap for SVGs later if desired. */
const ICONS = {
  router: '📡',
  computer: '💻',
  phone: '📱',
  iot: '🔌',
  unknown: '❓',
};

export default function DeviceNode({ data }) {
  const isRouter = data.id === 'router';
  const offline = data.status === 'offline';

  return (
    <div
      className={`device-node ${isRouter ? 'is-router' : ''} `
        + `${offline ? 'is-offline' : ''} ${data.isNew ? 'is-new' : ''} `
        + `${data.isSelected ? 'is-selected' : ''}`}
    >
      {/* The router only sends edges downward; devices only receive them. */}
      {!isRouter && <Handle type="target" position={Position.Top} />}

      <div className="device-icon">{ICONS[data.icon] ?? ICONS.unknown}</div>

      <div className="device-body">
        <div className="device-label" title={data.label}>{data.label}</div>
        <div className="device-ip">{data.ip}</div>

        <div className="device-meta">
          {data.os_guess && data.os_guess !== 'Unknown' && (
            <span className="tag">{data.os_guess}</span>
          )}
          {data.scan_profile === 'light' && (
            <span className="tag tag-fragile" title="Scanned gently — fragile/IoT device">
              fragile
            </span>
          )}
          {offline && <span className="tag tag-offline">offline</span>}
          {data.isNew && (
            <span className="tag tag-new" title="Found by the last rescan">new</span>
          )}
        </div>

        {data.open_ports?.length > 0 && (
          <div className="device-ports">
            {data.open_ports.slice(0, 4).join(' · ')}
            {data.open_ports.length > 4 && ` +${data.open_ports.length - 4}`}
          </div>
        )}
      </div>

      {isRouter && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
