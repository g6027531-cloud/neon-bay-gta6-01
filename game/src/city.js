// NEON BAY's city: a road grid over a coastal map, the blocks between the
// roads filled with buildings, a beach and sea along the south edge, and a
// marina on the east. The road graph is a plain grid — every road centre is
// GRID apart — so traffic, police and the autopilot can navigate it with
// simple grid math instead of a pathfinder.
import { GRID, GRID_ORIGIN, ROAD_WIDTH, WORLD, PLACES } from './config.js';

/** Road centre coordinates, one per grid line, across the whole map. */
export const ROAD_XS = [];
export const ROAD_YS = [];
for (let x = GRID_ORIGIN; x < WORLD.width - 100; x += GRID) ROAD_XS.push(x);
for (let y = GRID_ORIGIN; y < WORLD.beachY - 100; y += GRID) ROAD_YS.push(y);

const ROAD_HALF = ROAD_WIDTH / 2;

/** Is (x, y) on a road (within half the road width of a grid line)? */
export function onRoad(x, y) {
  if (y > WORLD.beachY) return false;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= ROAD_HALF) return true;
  return false;
}

/** Is (x, y) on sand or in the sea? */
export function terrainAt(x, y) {
  if (y >= WORLD.seaY) return 'sea';
  if (y >= WORLD.beachY) return 'sand';
  return onRoad(x, y) ? 'road' : 'block';
}

/** Nearest point on the road grid to (x, y), snapped to a road centre. */
export function nearestRoadPoint(x, y) {
  let bx = ROAD_XS[0];
  let bd = Math.abs(x - bx);
  for (const rx of ROAD_XS) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; bx = rx; }
  }
  let by = ROAD_YS[0];
  bd = Math.abs(y - by);
  for (const ry of ROAD_YS) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; by = ry; }
  }
  // Snap to whichever axis is closer: the point lies on a road either way.
  return Math.abs(x - bx) <= Math.abs(y - by) ? { x: bx, y } : { x, y: by };
}

/** The closest road-centre coordinate on one axis (used by the chases). */
export function nearestRoadX(x) {
  let best = ROAD_XS[0];
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < Math.abs(x - best)) best = rx;
  return best;
}
export function nearestRoadY(y) {
  let best = ROAD_YS[0];
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < Math.abs(y - best)) best = ry;
  return best;
}

/**
 * One building: an axis-aligned rectangle with a roof colour and a height
 * (drawn as a fake 3D offset). Buildings fill the blocks between roads.
 */
export function buildCity(random) {
  const buildings = [];
  const roofs = ['#6a7080', '#7d6a7e', '#667e7a', '#7e7266', '#64708b'];
  for (let xi = 0; xi < ROAD_XS.length - 1; xi += 1) {
    for (let yi = 0; yi < ROAD_YS.length - 1; yi += 1) {
      const x0 = ROAD_XS[xi] + ROAD_HALF + 14;
      const x1 = ROAD_XS[xi + 1] - ROAD_HALF - 14;
      const y0 = ROAD_YS[yi] + ROAD_HALF + 14;
      const y1 = ROAD_YS[yi + 1] - ROAD_HALF - 14;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      // One or two buildings per block, with a gap between them.
      const split = random() < 0.5;
      if (split && x1 - x0 > 170) {
        const mid = x0 + (x1 - x0) * (0.42 + random() * 0.16);
        buildings.push(makeBuilding(x0, y0, mid - 12, y1, random, roofs));
        buildings.push(makeBuilding(mid + 12, y0, x1, y1, random, roofs));
      } else if (split) {
        const mid = y0 + (y1 - y0) * (0.42 + random() * 0.16);
        buildings.push(makeBuilding(x0, y0, x1, mid - 12, random, roofs));
        buildings.push(makeBuilding(x0, mid + 12, x1, y1, random, roofs));
      } else {
        buildings.push(makeBuilding(x0, y0, x1, y1, random, roofs));
      }
    }
  }
  // Landmarks get open plazas: no building may cover a named place.
  const clearings = Object.values(PLACES).map((p) => ({ x: p.x, y: p.y, r: 95 }));
  return { buildings: buildings.filter((b) => !clearings.some((c) => b.x < c.x + c.r && b.x + b.w > c.x - c.r && b.y < c.y + c.r && b.y + b.h > c.y - c.r)) };
}

function makeBuilding(x0, y0, x1, y1, random, roofs) {
  return {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    roof: roofs[Math.floor(random() * roofs.length)],
    height: 10 + random() * 26,
  };
}

/** Circle (x, y, r) against every building: returns the building hit, or null. */
export function hitBuilding(buildings, x, y, r) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of any building it overlaps; returns true if it hit one. */
export function resolveBuilding(buildings, body, r) {
  let hit = false;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * r;
      body.y = cy + (dy / d) * r;
    } else {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - r;
      else if (m === right) body.x = b.x + b.w + r;
      else if (m === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
    }
  }
  return hit;
}

/** A random point on a road, away from the given spot (for spawning cars). */
export function randomRoadPoint(random, avoidX, avoidY, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    const vertical = random() < 0.5;
    const x = vertical
      ? ROAD_XS[Math.floor(random() * ROAD_XS.length)]
      : GRID_ORIGIN + random() * (WORLD.width - GRID_ORIGIN * 2);
    const y = vertical
      ? GRID_ORIGIN + random() * (WORLD.beachY - GRID_ORIGIN * 2)
      : ROAD_YS[Math.floor(random() * ROAD_YS.length)];
    if (Math.hypot(x - avoidX, y - avoidY) >= minDist) return { x, y };
  }
  return { x: ROAD_XS[0], y: ROAD_YS[0] };
}
