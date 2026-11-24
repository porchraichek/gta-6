// Extra vehicle archetypes and per-type handling traits, merged into config.js VEHICLES at module load.
// Traits: kind ('car' | 'bike' | 'boat'), drive ('fwd' | 'rwd' | 'awd'), drift (0..1, how easily the rear lets go),
// nitro (player boost with Shift), brake (deceleration m/s^2).
import { VEHICLES } from './config.js';

const NEW_TYPES = {
  taxi: { name: 'Sunfare Cab', length: 4.7, width: 1.86, height: 1.45, maxSpeed: 39, accel: 18, grip: 5.1, steer: 0.56, health: 140, mass: 1.05, price: 0 },
  muscle: { name: 'Thunderhoof', length: 4.9, width: 1.95, height: 1.3, maxSpeed: 54, accel: 30, grip: 5.0, steer: 0.55, health: 150, mass: 1.25, price: 0 },
  supercar: { name: 'Zephyr X9', length: 4.55, width: 2.0, height: 1.08, maxSpeed: 68, accel: 38, grip: 7.2, steer: 0.6, health: 115, mass: 0.95, price: 0 },
  bus: { name: 'Coastliner', length: 10.6, width: 2.5, height: 3.1, maxSpeed: 26, accel: 8, grip: 4.0, steer: 0.44, health: 400, mass: 4.0, price: 0 },
  bike: { name: 'Razorback 600', length: 2.15, width: 0.8, height: 1.2, maxSpeed: 55, accel: 34, grip: 6.0, steer: 0.75, health: 70, mass: 0.35, price: 0 },
  speedboat: { name: 'Wavecutter', length: 6.4, width: 2.3, height: 1.4, maxSpeed: 42, accel: 15, grip: 1.6, steer: 0.7, health: 160, mass: 1.4, price: 0 },
};

const TRAITS = {
  compact: { kind: 'car', drive: 'fwd', drift: 0.35, brake: 32 },
  sedan: { kind: 'car', drive: 'fwd', drift: 0.3, brake: 32 },
  taxi: { kind: 'car', drive: 'fwd', drift: 0.3, brake: 32 },
  sports: { kind: 'car', drive: 'rwd', drift: 0.75, brake: 40, nitro: true },
  muscle: { kind: 'car', drive: 'rwd', drift: 1.0, brake: 34, nitro: true },
  supercar: { kind: 'car', drive: 'awd', drift: 0.55, brake: 46, nitro: true },
  pickup: { kind: 'car', drive: 'rwd', drift: 0.55, brake: 28 },
  van: { kind: 'car', drive: 'rwd', drift: 0.35, brake: 26 },
  bus: { kind: 'car', drive: 'rwd', drift: 0.15, brake: 20 },
  cruiser: { kind: 'car', drive: 'rwd', drift: 0.6, brake: 38 },
  swat: { kind: 'car', drive: 'awd', drift: 0.25, brake: 30 },
  bike: { kind: 'bike', drive: 'rwd', drift: 0.6, brake: 36 },
  speedboat: { kind: 'boat', drive: 'rwd', drift: 0, brake: 10, nitro: true },
};

Object.assign(VEHICLES, NEW_TYPES);
for (const [type, t] of Object.entries(TRAITS)) if (VEHICLES[type]) Object.assign(VEHICLES[type], t);
for (const def of Object.values(VEHICLES)) {
  def.kind ??= 'car';
  def.drive ??= 'rwd';
  def.drift ??= 0.4;
  def.brake ??= 32;
}

// Weighted pool of ambient traffic types (moving cars).
export const TRAFFIC_POOL = [
  ['sedan', 6], ['compact', 5], ['taxi', 3], ['pickup', 2.5], ['van', 2], ['sports', 1.4], ['muscle', 1.2], ['supercar', 0.5], ['bike', 1.6], ['bus', 0.7],
];
// Kerbside parked types (no buses).
export const PARKED_POOL = [
  ['sedan', 6], ['compact', 5], ['pickup', 2], ['van', 1.6], ['sports', 1.2], ['muscle', 1.1], ['supercar', 0.45], ['bike', 1.4], ['taxi', 0.8],
];

// Paint palette: mostly everyday neutrals with a splash of coastal pastels and loud sports colours.
const NEUTRALS = [0xf1f1ee, 0xc4c9cf, 0x8a9097, 0x2b2e33, 0x15171a, 0x1d3557, 0x6b2a2a, 0x3c4a3e, 0xd8cbb0];
const PASTELS = [0xff8fa3, 0x7fd8c8, 0xffd6a5, 0xa0c4ff, 0xcdb4db, 0x9bf6ff];
const LOUD = [0xe63946, 0xffd166, 0x3a86ff, 0xff6fb5, 0x8338ec, 0x06d6a0, 0xf77f00];
export const FIXED_PAINT = { taxi: 0xf5c518, bus: 0x2a9d8f };

export function pickWeighted(pool, rng) {
  let sum = 0;
  for (const [, w] of pool) sum += w;
  let r = rng() * sum;
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return pool[0][0];
}

export function pickPaint(type, rng) {
  if (FIXED_PAINT[type]) return FIXED_PAINT[type];
  const fast = type === 'sports' || type === 'supercar' || type === 'muscle' || type === 'bike';
  const r = rng();
  const set = fast ? (r < 0.6 ? LOUD : r < 0.8 ? PASTELS : NEUTRALS) : r < 0.68 ? NEUTRALS : r < 0.88 ? PASTELS : LOUD;
  return set[Math.floor(rng() * set.length)];
}
