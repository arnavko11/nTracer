/**
 * Translation between the .nettrace save format and React Flow's
 * nodes/edges arrays.
 *
 * The save file stays the single source of truth; React Flow objects are
 * derived from it and thrown away on every change.
 */

import { applyStarLayout, starEdges } from './layout';

/** Build React Flow nodes + edges from a .nettrace map object. */
export function mapToFlow(map) {
  const laid = applyStarLayout(map);
  const devices = laid.router ? [laid.router, ...laid.devices] : laid.devices;

  const nodes = devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: device.position,
    // The whole device object rides along so DeviceNode can render every
    // field without a second lookup.
    data: device,
  }));

  const edges = (laid.edges?.length ? laid.edges : starEdges(laid)).map((edge) => ({
    id: `${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    // Offline devices get a dimmed, dashed link.
    className: isOffline(laid, edge.target) ? 'edge-offline' : undefined,
  }));

  return { nodes, edges };
}

function isOffline(map, deviceId) {
  return map.devices.some((d) => d.id === deviceId && d.status === 'offline');
}

/**
 * Write dragged node positions back into the map, so a later save keeps the
 * user's layout.
 */
export function applyPositions(map, nodes) {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  return {
    ...map,
    router: map.router
      ? { ...map.router, position: positions.get(map.router.id) ?? map.router.position }
      : null,
    devices: map.devices.map((device) => ({
      ...device,
      position: positions.get(device.id) ?? device.position,
    })),
  };
}
