/**
 * Translation between the .nettrace save format and React Flow's
 * nodes/edges arrays.
 *
 * The save file stays the single source of truth; React Flow objects are
 * derived from it and thrown away on every change.
 */

import { applyStarLayout, starEdges } from './layout';

const EMPTY_SET = new Set();

/**
 * Turn a raw scan result into a complete .nettrace map: lay the nodes out in
 * a star and materialise the router→device edges, so the result is ready to
 * render *and* ready to save.
 */
export function buildMapFromScan(scan) {
  const laid = applyStarLayout(scan);
  return { ...laid, edges: starEdges(laid) };
}

/**
 * Build React Flow nodes + edges from a .nettrace map object.
 *
 * The view-only extras are passed separately rather than written onto the
 * devices, because none of them belong in a saved file:
 *
 * @param {object} map
 * @param {object} [view]
 * @param {Set<string>} [view.newIds]     devices a rescan just discovered
 * @param {string|null} [view.selectedId] device shown in the details panel
 * @param {object|null} [view.trace]      traceroute result to overlay
 */
export function mapToFlow(map, view = {}) {
  const { newIds = EMPTY_SET, selectedId = null, trace = null } = view;
  const laid = applyStarLayout(map);
  const devices = laid.router ? [laid.router, ...laid.devices] : laid.devices;

  const nodes = devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: device.position,
    // The whole device object rides along so DeviceNode can render every
    // field without a second lookup.
    data: {
      ...device,
      isNew: newIds.has(device.id),
      isSelected: device.id === selectedId,
    },
  }));

  const edges = (laid.edges?.length ? laid.edges : starEdges(laid)).map((edge) => {
    const traced = trace?.deviceId === edge.target;

    return {
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      // A traced path animates and carries its hop count and latency;
      // otherwise offline devices get a dimmed, dashed link.
      animated: traced,
      label: traced ? traceLabel(trace) : undefined,
      className: traced
        ? 'edge-trace'
        : (isOffline(laid, edge.target) ? 'edge-offline' : undefined),
    };
  });

  return { nodes, edges };
}

/** "2 hops · 9.8 ms" — or why the trace didn't get there. */
function traceLabel(trace) {
  if (!trace.reached) return 'no route';

  const last = trace.hops[trace.hops.length - 1];
  const latency = last?.avg_ms != null ? ` · ${last.avg_ms} ms` : '';
  return `${trace.hops.length} hop${trace.hops.length === 1 ? '' : 's'}${latency}`;
}

function isOffline(map, deviceId) {
  return map.devices.some((d) => d.id === deviceId && d.status === 'offline');
}

/**
 * Write dragged node positions back into the map, so a later save keeps the
 * user's layout.
 *
 * Returns the original map unchanged when nothing actually moved — React Flow
 * fires a drag-stop for a plain click too, and a click shouldn't mark the map
 * as having unsaved changes.
 */
export function applyPositions(map, nodes) {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  let moved = false;

  const reposition = (device) => {
    const next = positions.get(device.id);
    if (!next || samePosition(next, device.position)) return device;
    moved = true;
    return { ...device, position: next };
  };

  const router = map.router ? reposition(map.router) : null;
  const devices = map.devices.map(reposition);

  return moved ? { ...map, router, devices } : map;
}

function samePosition(a, b) {
  return Boolean(b) && a.x === b.x && a.y === b.y;
}
