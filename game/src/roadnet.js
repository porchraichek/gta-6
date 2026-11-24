// Road network: a grid of intersections, lane geometry, routing and traffic-light phases.
import { N, PITCH, HALF, ROAD, LANE } from './config.js';

export const nodeX = (i) => -HALF + i * PITCH;
export const nodeZ = (j) => -HALF + j * PITCH;

export function nearestIndex(v) {
  return Math.max(0, Math.min(N, Math.round((v + HALF) / PITCH)));
}
export const nearestNode = (x, z) => ({ i: nearestIndex(x), j: nearestIndex(z) });

// Is (x,z) on asphalt (road surface)?
export function onRoad(x, z, margin = 0) {
  const fx = (x + HALF) / PITCH, fz = (z + HALF) / PITCH;
  const dx = Math.abs(fx - Math.round(fx)) * PITCH, dz = Math.abs(fz - Math.round(fz)) * PITCH;
  const inX = Math.abs(x) <= HALF + ROAD / 2, inZ = Math.abs(z) <= HALF + ROAD / 2;
  return (inX && inZ) && (dx < ROAD / 2 + margin || dz < ROAD / 2 + margin);
}

// Travel directions as grid steps: East, West, South (+z), North (-z).
export const DIRS = [
  { di: 1, dj: 0, name: 'E', axis: 'x' },
  { di: -1, dj: 0, name: 'W', axis: 'x' },
  { di: 0, dj: 1, name: 'S', axis: 'z' },
  { di: 0, dj: -1, name: 'N', axis: 'z' },
];

export function neighbors(i, j) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const ni = i + DIRS[d].di, nj = j + DIRS[d].dj;
    if (ni >= 0 && ni <= N && nj >= 0 && nj <= N) out.push({ i: ni, j: nj, dir: d });
  }
  return out;
}

// Right-hand-traffic lane centre point on the segment leaving node (i,j) in direction d.
export function lanePoint(i, j, d, along = 0) {
  const cx = nodeX(i), cz = nodeZ(j);
  switch (d) {
    case 0: return [cx + along, cz + LANE]; // east: right side is south (+z)
    case 1: return [cx - along, cz - LANE];
    case 2: return [cx - LANE, cz + along]; // south: right side is west
    default: return [cx + LANE, cz - along];
  }
}

// Breadth-first route between intersections. Returns list of {i,j}, excluding the start.
export function route(a, b, avoid) {
  if (a.i === b.i && a.j === b.j) return [];
  const key = (i, j) => i * 64 + j;
  const prev = new Map();
  prev.set(key(a.i, a.j), null);
  const queue = [a];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur.i === b.i && cur.j === b.j) break;
    for (const nb of neighbors(cur.i, cur.j)) {
      const k = key(nb.i, nb.j);
      if (prev.has(k)) continue;
      if (avoid && avoid.i === nb.i && avoid.j === nb.j) continue;
      prev.set(k, cur);
      queue.push(nb);
    }
  }
  const out = [];
  let cur = prev.has(key(b.i, b.j)) ? b : null;
  while (cur && !(cur.i === a.i && cur.j === a.j)) {
    out.push({ i: cur.i, j: cur.j });
    cur = prev.get(key(cur.i, cur.j));
  }
  return out.reverse();
}

// Traffic lights: 22 s cycle, offset per intersection. Returns 'green' | 'yellow' | 'red' for travel along axis.
const CYCLE = 18;
export function lightState(i, j, axis, time) {
  const t = (time + ((i * 7 + j * 3) % 11)) % CYCLE;
  const xPhase = t < 7 ? 'green' : t < 9 ? 'yellow' : 'red';
  const zPhase = t >= 9 && t < 16 ? 'green' : t >= 16 ? 'yellow' : 'red';
  return axis === 'x' ? xPhase : zPhase;
}

export function randomNode(rng) {
  return { i: Math.floor(rng() * (N + 1)), j: Math.floor(rng() * (N + 1)) };
}

// Pick a point on a random road within [rMin,rMax] of (px,pz): returns {x,z,dir,i,j}
export function randomRoadPoint(rng, px, pz, rMin, rMax) {
  for (let tries = 0; tries < 20; tries++) {
    const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
    const n = nearestNode(x, z);
    const fx = Math.abs((x + HALF) / PITCH - Math.round((x + HALF) / PITCH)) * PITCH;
    const fz = Math.abs((z + HALF) / PITCH - Math.round((z + HALF) / PITCH)) * PITCH;
    // snap to whichever road is closer
    if (fx < fz) {
      const cx = nodeX(n.i);
      const east = rng() < 0.5; // along z: heading S or N
      const d = east ? 2 : 3;
      return { x: cx + (d === 2 ? -LANE : LANE), z, dir: d, i: n.i, j: n.j };
    }
    const cz = nodeZ(n.j);
    const d = rng() < 0.5 ? 0 : 1;
    return { x, z: cz + (d === 0 ? LANE : -LANE), dir: d, i: n.i, j: n.j };
  }
  return null;
}

// Ground height: asphalt 0.04, block slabs (sidewalks) 0.18, sand outside the grid 0.
export function groundY(x, z) {
  if (Math.abs(x) > HALF + ROAD / 2 || Math.abs(z) > HALF + ROAD / 2) return 0;
  return onRoad(x, z) ? 0.04 : 0.18;
}
