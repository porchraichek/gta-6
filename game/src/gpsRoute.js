// GPS: shortest path along the road grid from the player to a target point, cached until the end intersections change.
import { N, PITCH, HALF } from './config.js';
import { nodeX, nodeZ, route } from './roadnet.js';

const clampI = (v) => Math.max(0, Math.min(N, v));

// The (up to) four intersections around a point.
function corners(x, z) {
  const fx = (x + HALF) / PITCH, fz = (z + HALF) / PITCH;
  const out = [];
  for (const i of new Set([clampI(Math.floor(fx)), clampI(Math.ceil(fx))])) {
    for (const j of new Set([clampI(Math.floor(fz)), clampI(Math.ceil(fz))])) out.push({ i, j });
  }
  return out;
}

const dist = (x, z, n) => Math.hypot(x - nodeX(n.i), z - nodeZ(n.j));
const grid = (a, b) => (Math.abs(a.i - b.i) + Math.abs(a.j - b.j)) * PITCH;

export function createGps() {
  let key = '', path = [];
  // Returns an array of [x,z] points: player -> intersections -> target.
  return (px, pz, tx, tz) => {
    let best = null, bestCost = Infinity;
    const ends = corners(tx, tz);
    for (const a of corners(px, pz)) {
      for (const b of ends) {
        const c = dist(px, pz, a) + grid(a, b) + dist(tx, tz, b);
        if (c < bestCost) { bestCost = c; best = [a, b]; }
      }
    }
    if (!best) return [];
    if (Math.hypot(px - tx, pz - tz) < PITCH * 0.6) return [[px, pz], [tx, tz]];
    const [a, b] = best;
    const k = `${a.i},${a.j}>${b.i},${b.j}`;
    if (k !== key) {
      key = k;
      path = [a, ...route(a, b)].map((n) => [nodeX(n.i), nodeZ(n.j)]);
    }
    return [[px, pz], ...path, [tx, tz]];
  };
}
