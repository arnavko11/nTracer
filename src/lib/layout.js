/**
 * Automatic topology layout.
 *
 * Consumer routers expose no wiring information, so nTracer always draws a
 * star: the router pinned at the top, every device on an arc beneath it. The
 * user is free to drag nodes afterwards, so layout only ever *fills in* a
 * position — it never moves a node that already has one.
 */

/** Router's fixed spot at the top of the canvas. */
const ROUTER_POSITION = { x: 480, y: 60 };

/** Geometry of the device arc hanging below the router. */
const ARC = {
  radius: 320,      // distance from the router
  spread: 150,      // total angle covered, in degrees
  rowHeight: 190,   // vertical gap when devices wrap to a second arc
  perRow: 8,        // devices per arc before wrapping
};

/** True if a node has a real, user-meaningful position. */
function hasPosition(node) {
  const p = node?.position;
  return Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y)
    && !(p.x === 0 && p.y === 0);
}

/**
 * Position of the nth device in a star of `total` devices.
 * Devices fan out symmetrically below the router and wrap onto lower arcs
 * once a row is full, so 30 devices stay readable.
 */
function arcPosition(index, total) {
  const row = Math.floor(index / ARC.perRow);
  const inRow = index % ARC.perRow;
  const rowCount = Math.min(ARC.perRow, total - row * ARC.perRow);

  // Sweep left-to-right across `spread` degrees, centred on straight down.
  const step = rowCount > 1 ? ARC.spread / (rowCount - 1) : 0;
  const degrees = 90 - ARC.spread / 2 + inRow * step;
  const radians = (degrees * Math.PI) / 180;

  return {
    x: Math.round(ROUTER_POSITION.x + Math.cos(radians) * ARC.radius),
    y: Math.round(ROUTER_POSITION.y + Math.sin(radians) * ARC.radius + row * ARC.rowHeight),
  };
}

/**
 * Return a copy of `map` with a position on every node that lacks one.
 * Existing positions (loaded from a .nettrace file, or set by dragging) are
 * left exactly as they are.
 */
export function applyStarLayout(map) {
  const router = map.router && {
    ...map.router,
    position: hasPosition(map.router) ? map.router.position : ROUTER_POSITION,
  };

  const devices = map.devices.map((device, index) => ({
    ...device,
    position: hasPosition(device)
      ? device.position
      : arcPosition(index, map.devices.length),
  }));

  return { ...map, router, devices };
}

/**
 * Star edges: one link from the router to every device.
 * Used when a scan produces devices but no edges (milestone 3).
 */
export function starEdges(map) {
  if (!map.router) return [];
  return map.devices.map((device) => ({
    source: map.router.id,
    target: device.id,
  }));
}
