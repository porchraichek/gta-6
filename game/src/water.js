// Sea geometry helpers for boats: sea level, the sloped shore skirt around the island, and keeping hulls off land.
import { ISLAND } from './config.js';

export const SEA_Y = -0.9;
const SKIRT = 46; // shore slope width beyond the island edge (matches terrainMesh)
const SKIRT_DEPTH = -3.2;
const SEA_LIMIT = ISLAND + 520; // how far out boats may roam

// Distance past the island edge (negative while on land).
export const shoreDistance = (x, z) => Math.max(Math.abs(x), Math.abs(z)) - ISLAND;

// Height of the sand / seabed under (x, z).
export function seabedY(x, z) {
  const d = shoreDistance(x, z);
  if (d <= 0) return 0;
  return d < SKIRT ? (SKIRT_DEPTH * d) / SKIRT : SKIRT_DEPTH;
}

// Keep a boat position {x, z} out on the water. Returns true if it had to be pushed.
export function keepBoatAtSea(p, margin = 2) {
  let hit = false;
  const ax = Math.abs(p.x), az = Math.abs(p.z), lim = ISLAND + margin;
  if (ax < lim && az < lim) {
    if (lim - ax < lim - az) p.x = Math.sign(p.x || 1) * lim;
    else p.z = Math.sign(p.z || 1) * lim;
    hit = true;
  }
  if (Math.abs(p.x) > SEA_LIMIT) { p.x = Math.sign(p.x) * SEA_LIMIT; hit = true; }
  if (Math.abs(p.z) > SEA_LIMIT) { p.z = Math.sign(p.z) * SEA_LIMIT; hit = true; }
  return hit;
}

// Gentle swell height at a point and time.
export const swell = (x, z, t) => Math.sin(t * 1.3 + x * 0.09) * 0.09 + Math.sin(t * 0.9 + z * 0.07) * 0.07;
