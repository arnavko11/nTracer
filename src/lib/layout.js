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

/**
 * Geometry of the device grid below the router.
 *
 * An arc looks prettier in a mockup but collides badly once rows wrap — the
 * ends of one arc sit at nearly the same height as the middle of the next. A
 * grid can't collide, and since every edge converges on the router anyway,
 * the star still reads as a star.
 */
const GRID = {
  columnWidth: 230,   // node is 190px wide, so this leaves a 40px gutter
  rowHeight: 150,
  topGap: 240,        // vertical distance from the router to the first row
  perRow: 6,
};

/** True if a node has a real, user-meaningful position. */
function hasPosition(node) {
  const p = node?.position;
  return Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y)
    && !(p.x === 0 && p.y === 0);
}

/**
 * Position of the nth device in a grid of `total` devices.
 * Rows are centred under the router, so a partial last row stays balanced.
 */
function gridPosition(index, total) {
  const row = Math.floor(index / GRID.perRow);
  const column = index % GRID.perRow;
  const inThisRow = Math.min(GRID.perRow, total - row * GRID.perRow);

  const offsetFromCentre = column - (inThisRow - 1) / 2;

  return {
    x: Math.round(ROUTER_POSITION.x + offsetFromCentre * GRID.columnWidth),
    y: ROUTER_POSITION.y + GRID.topGap + row * GRID.rowHeight,
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
      : gridPosition(index, map.devices.length),
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
