// Static collision world: spatial hash of building/prop boxes, circle push-out, and ray queries.
import { ISLAND } from './config.js';

const CELL = 24;

export function createCollision(colliders) {
  const cells = new Map();
  const key = (cx, cz) => cx * 4099 + cz;
  for (const c of colliders) {
    const x0 = Math.floor(c.x0 / CELL), x1 = Math.floor(c.x1 / CELL), z0 = Math.floor(c.z0 / CELL), z1 = Math.floor(c.z1 / CELL);
    for (let a = x0; a <= x1; a++) {
      for (let b = z0; b <= z1; b++) {
        const k = key(a, b);
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(c);
      }
    }
  }
  let stamp = 0;
  const scratch = [];

  function query(x, z, r) {
    stamp++;
    scratch.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let a = x0; a <= x1; a++) {
      for (let b = z0; b <= z1; b++) {
        const list = cells.get(key(a, b));
        if (!list) continue;
        for (const c of list) {
          if (c._s !== stamp) {
            c._s = stamp;
            scratch.push(c);
          }
        }
      }
    }
    return scratch;
  }

  // Push a circle out of all boxes. Returns {hit, nx, nz, depth} for the deepest contact (hit=false when free).
  const result = { hit: false, nx: 0, nz: 0, depth: 0, pole: false, x: 0, z: 0 };
  function pushCircle(x, z, r, maxH = 1e9) {
    result.hit = false;
    result.depth = 0;
    result.pole = false;
    for (let pass = 0; pass < 2; pass++) {
      const list = query(x, z, r + 1);
      for (const c of list) {
        if (c.h < 0.2 || (c.low && maxH > c.h)) continue;
        const px = Math.max(c.x0, Math.min(x, c.x1)), pz = Math.max(c.z0, Math.min(z, c.z1));
        let dx = x - px, dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, depth;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = r - d;
        } else {
          // centre inside the box: exit through the nearest face
          const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) { nx = -1; nz = 0; depth = l + r; }
          else if (m === rr) { nx = 1; nz = 0; depth = rr + r; }
          else if (m === t) { nx = 0; nz = -1; depth = t + r; }
          else { nx = 0; nz = 1; depth = b + r; }
        }
        x += nx * depth;
        z += nz * depth;
        if (depth > result.depth) {
          result.hit = true;
          result.nx = nx;
          result.nz = nz;
          result.depth = depth;
          result.pole = !!c.pole;
        }
      }
    }
    result.x = x;
    result.z = z;
    return result;
  }

  // Ray against boxes (2D slab test, then height check). Returns distance or Infinity.
  function rayDistance(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = Infinity;
    stamp++;
    const steps = Math.ceil(maxDist / (CELL * 0.6));
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxDist, s * CELL * 0.6);
      const list = query(ox + dx * t, oz + dz * t, CELL * 0.7);
      for (const c of list) {
        if (c.h < 0.2) continue;
        let tmin = 0, tmax = maxDist;
        if (Math.abs(dx) < 1e-8) { if (ox < c.x0 || ox > c.x1) continue; }
        else {
          let t1 = (c.x0 - ox) / dx, t2 = (c.x1 - ox) / dx;
          if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(dz) < 1e-8) { if (oz < c.z0 || oz > c.z1) continue; }
        else {
          let t1 = (c.z0 - oz) / dz, t2 = (c.z1 - oz) / dz;
          if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (tmin > tmax) continue;
        const y = oy + dy * tmin;
        if (y < 0 || y > c.h) continue;
        if (tmin < best) best = tmin;
      }
      // scratch is reused by nested queries; stamp already bumped, so continue to next sample
      stamp++;
    }
    return best;
  }

  function lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return rayDistance(ax, ay, az, dx / d, dy / d, dz / d, d) === Infinity;
  }

  return { query, pushCircle, rayDistance, lineOfSight };
}

export function clampToIsland(p, margin = 1) {
  const m = ISLAND - margin;
  let hit = false;
  if (p.x > m) { p.x = m; hit = true; }
  if (p.x < -m) { p.x = -m; hit = true; }
  if (p.z > m) { p.z = m; hit = true; }
  if (p.z < -m) { p.z = -m; hit = true; }
  return hit;
}
