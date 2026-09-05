/**
 * Merging a fresh scan into the map you already have.
 *
 * A rescan must never throw away your work. Devices are matched by `id` (the
 * MAC address), and the merge is deliberately conservative:
 *
 *   - **still there** → refreshed with the new scan data, but `position`,
 *     `label`, `notes` and `first_seen` are yours and are left alone
 *   - **gone** → marked `offline` rather than deleted, so an unplugged device
 *     keeps its place on the map
 *   - **new** → added, and positioned in a tray row below the existing layout
 *
 * Note that a scan run without root produces no MAC addresses, so devices fall
 * back to IP-based ids — and a device that changes IP between rescans then
 * looks like a new device. That's a reason to run with sudo, not something the
 * merge can fix.
 */

import { placeNewDevices, starEdges } from './layout';

/**
 * @param {object} current  the map on screen
 * @param {object} scan     a fresh result from scan.py
 * @returns {{map: object, newIds: Set<string>, summary: object}}
 */
export function mergeScan(current, scan) {
  const timestamp = scan.last_scan;
  const fresh = new Map(scan.devices.map((device) => [device.id, device]));
  const summary = { updated: 0, returned: 0, offline: 0, added: 0 };

  const devices = current.devices.map((existing) => {
    const match = fresh.get(existing.id);

    if (!match) {
      // Only count it as newly-offline if it wasn't already.
      if (existing.status !== 'offline') summary.offline += 1;
      return { ...existing, status: 'offline' };
    }

    fresh.delete(existing.id);
    if (existing.status === 'offline') summary.returned += 1;
    else summary.updated += 1;
    return mergeDevice(existing, match);
  });

  const added = [...fresh.values()];
  summary.added = added.length;

  const merged = {
    ...current,
    subnet: scan.subnet ?? current.subnet,
    privileged: scan.privileged,
    router: mergeRouter(current.router, scan.router),
    devices: [...devices, ...added],
    last_scan: timestamp,
  };

  const newIds = new Set(added.map((device) => device.id));

  return {
    map: withEdges(placeNewDevices(merged, newIds)),
    newIds,
    summary,
  };
}

/** Fresh scan data wins, except for the fields the user owns. */
function mergeDevice(existing, scanned) {
  return {
    ...scanned,
    position: existing.position,
    label: existing.label,
    notes: existing.notes,
    first_seen: existing.first_seen,
  };
}

/** The router is merged on the same terms; a scan that finds none keeps ours. */
function mergeRouter(existing, scanned) {
  if (!scanned) return existing ? { ...existing, status: 'offline' } : null;
  if (!existing) return scanned;
  return mergeDevice(existing, scanned);
}

/**
 * Keep whatever edges the map already had and add a star edge for each new
 * device, so any hand-drawn topology survives a rescan.
 */
function withEdges(map) {
  const existing = map.edges ?? [];
  const connected = new Set(existing.flatMap((edge) => [edge.source, edge.target]));

  const missing = starEdges(map).filter((edge) => !connected.has(edge.target));

  return { ...map, edges: [...existing, ...missing] };
}

/** "3 new · 1 went offline · 12 updated" — nothing changed reads as such. */
export function describeSummary({ added, offline, returned, updated }) {
  const parts = [];
  if (added) parts.push(`${added} new`);
  if (offline) parts.push(`${offline} went offline`);
  if (returned) parts.push(`${returned} back online`);
  if (updated) parts.push(`${updated} still up`);
  return parts.length ? parts.join(' · ') : 'No changes.';
}
