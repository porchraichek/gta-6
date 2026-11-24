// Street names for the road grid: north-south streets (constant x) and east-west avenues (constant z), plus a lookup by position.
import { N, PITCH, HALF, ROAD, DISTRICTS } from './config.js';
import { districtOf } from './citygen.js';

// index k runs west->east for streets (x = -HALF + k*PITCH) and north->south for avenues (z = -HALF + k*PITCH)
export const STREETS_NS = [
  'Marrow Rd', 'Calle Verde', 'Hibiscus St', 'Pelican Way', 'Aurelio Ave', 'Cobalt St', 'Flamingo Blvd',
  'Mango St', 'Neon Mile', 'Bayfront Ave', 'Coquina St', 'Sandpiper Rd', 'Coral Shore Dr',
];
export const STREETS_EW = [
  'Villa Crest', 'Sunrise Ave', 'Palmetto Ter', 'Lucky Palm Ave', 'Trust Way', 'Royal Poinciana', 'Seagull Ave',
  'Saint Aurelia Ave', 'Gunmetal Row', 'Harbor Light Rd', 'Cargo Ave', 'Dock Line Rd', 'Breakwater Dr',
];

const idx = (v) => Math.round((v + HALF) / PITCH);

// Returns the street under (x,z): "A" on a road, "A & B" at a crossing, or the nearest street when inside a block.
export function streetAt(x, z) {
  if (Math.abs(x) > HALF + ROAD || Math.abs(z) > HALF + ROAD) return x > HALF ? 'Coral Beach' : 'Palmera Shore';
  const i = Math.max(0, Math.min(N, idx(x))), j = Math.max(0, Math.min(N, idx(z)));
  const dx = Math.abs(x - (-HALF + i * PITCH)), dz = Math.abs(z - (-HALF + j * PITCH));
  const lim = ROAD / 2 + 1;
  if (dx < lim && dz < lim) return `${STREETS_NS[i]} & ${STREETS_EW[j]}`;
  return dx < dz ? STREETS_NS[i] : STREETS_EW[j];
}

// District display name for a world position (sea and beach rings included).
export function districtNameAt(x, z) {
  const bi = Math.floor((x + HALF) / PITCH), bj = Math.floor((z + HALF) / PITCH);
  if (bi >= 0 && bi < N && bj >= 0 && bj < N) return DISTRICTS[districtOf(bi, bj)].name;
  if (Math.abs(x) < HALF + 80 && Math.abs(z) < HALF + 80) return x > HALF ? 'Coral Beach' : 'Palmera Shore';
  return 'Open Water';
}
