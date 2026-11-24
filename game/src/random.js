// Seeded random numbers (mulberry32) plus small helpers, so the city is the same every run.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next;
  rng.range = (lo, hi) => lo + (hi - lo) * next();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  return rng;
}

// Unseeded randomness for gameplay moments.
export const rand = makeRng((Math.random() * 4294967296) >>> 0);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
