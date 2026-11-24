// Art-direction pass over the generated city data: facade styles, rooftop features, neon trim, shopfronts,
// billboards, street furniture, beach dressing and hill power lines. Uses its own RNG so the base layout
// (buildings, colliders, landmarks) is unaffected; everything here is additive data for the mesh builders.
import { N, BLOCK, HALF, ISLAND, PITCH } from './config.js';
import { makeRng } from './random.js';
import { nodeX, nodeZ } from './roadnet.js';

const NEON = ['#ff4fd8', '#6ee7ff', '#ffd166', '#8dffb0', '#ff7aa8', '#c792ff', '#ff9a6b'];

const blockOf = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + HALF) / PITCH)));

export function dressCity(city, districtOf) {
  const rng = makeRng(5150);
  city.furniture = []; // {type, x, z, ry}
  city.billboards = []; // {x, y, z, w, h, ry, ad, frame}
  city.powerPoles = []; // [{x, z}] runs, wired in sequence
  city.beachDecor = []; // {type, x, z, ry, color}
  city.neon = []; // {x, y, z, w, h, d, color} glowing tubes

  for (const b of city.buildings) {
    const bi = blockOf(b.x), bj = blockOf(b.z);
    b.district = districtOf(bi, bj);
    dressBuilding(city, b, rng);
  }
  for (const blk of city.blocks) streetFurniture(city, blk, rng);
  beach(city, rng);
  powerLines(city, districtOf);
}

function dressBuilding(city, b, rng) {
  const d = b.district;
  if (b.glass) {
    b.glassStyle = b.special === 'casino' ? 3 : b.special === 'bank' ? 2 : d === 'downtown' ? rng.int(0, 3) : rng.pick([0, 1]);
  } else if (d === 'harbor' || b.roof === 'sawtooth') b.style = 3;
  else if (d === 'beach' || b.special === 'yacht' || b.special === 'diner') b.style = 1;
  else if (d === 'hills' || b.special === 'villa') b.style = 2;
  else b.style = rng.chance(0.55) ? 0 : rng.chance(0.5) ? 2 : 1;

  // ground-floor shops on street-facing low/mid-rises
  if (!b.special && !b.glass && (d === 'midtown' || d === 'downtown' || d === 'beach') && b.h > 8) b.shops = rng.chance(0.75);
  if (!b.special && b.podium) b.shops = true;

  // rooftop features
  if (b.glass && b.h > 60) b.top = b.h > 120 ? rng.pick(['helipad', 'spire', 'crown']) : rng.pick(['helipad', 'crown', 'antennas']);
  else if (!b.glass && b.roof === 'flat' && (d === 'midtown' || d === 'downtown')) b.top = rng.chance(0.4) ? 'tank' : 'hvac';
  else if (d === 'beach' && b.roof === 'flat') b.top = 'deco';

  // neon: deco hotels get tubes along the parapet and corners; towers get crown rings
  if (d === 'beach' && !b.special) {
    b.neon = rng.pick(NEON);
    b.hotel = rng.int(0, 7);
  }
  if (b.special === 'casino') b.neon = '#ff4fd8';
  if (b.special === 'diner') b.neon = '#ff8fa3';
  if (b.special === 'race') b.neon = '#b388ff';
  if (b.glass && b.top === 'crown') b.neon = rng.pick(['#6ee7ff', '#ff4fd8', '#ffd166', '#ffffff']);

  // rooftop billboards on mid-height flat roofs in the busy districts
  if (!b.special && !b.glass && b.roof === 'flat' && b.h > 12 && b.h < 40 && (d === 'midtown' || d === 'downtown') && rng.chance(0.3)) {
    const ry = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const w = Math.min(14, Math.min(b.w, b.d) - 3);
    city.billboards.push({ x: b.x, y: b.h + 1.2, z: b.z, w, h: w / 2, ry, ad: rng.int(0, 7), frame: true });
  }
}

// Kerbside furniture along each block edge (pedestrians walk ~3.4 m in from the kerb, lamps at 1.4 m).
function streetFurniture(city, blk, rng) {
  const e = BLOCK / 2 - 1.1;
  const d = blk.district;
  const push = (type, x, z, ry) => city.furniture.push({ type, x, z, ry });
  const edges = [
    [0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2],
  ];
  for (const [sx, sz, ry] of edges) {
    // point at offset t along this edge; ry faces the road
    const at = (t, inset = 0) => [blk.cx + sx * (e - inset) + (sx ? 0 : t), blk.cz + sz * (e - inset) + (sz ? 0 : t)];
    if (d === 'park') {
      for (const t of [-12, 12]) push('bench', ...at(t, 1.2), ry + Math.PI);
      continue;
    }
    if (d === 'hills') {
      if (rng.chance(0.4)) push('bin', ...at(rng.range(-14, 14)), ry);
      continue;
    }
    if (rng.chance(d === 'harbor' ? 0.6 : 0.5)) push('hydrant', ...at(rng.pick([-17, 17]), 0.2), ry);
    if (d === 'harbor') {
      if (rng.chance(0.4)) push('barrier', ...at(rng.range(-12, 12), 0.3), ry);
      continue;
    }
    const busy = d === 'downtown' || d === 'midtown';
    if (busy && rng.chance(0.22)) {
      push('busStop', ...at(-11, 0.6), ry);
    } else {
      if (rng.chance(0.6)) push('bench', ...at(-11, 0.2), ry);
      if (rng.chance(0.6)) push('bin', ...at(-8, 0), ry);
    }
    if (rng.chance(busy ? 0.4 : 0.6)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) push('scooter', ...at(9 + k * 1.1, 0.3), ry + Math.PI / 2 + rng.range(-0.2, 0.2));
    }
    if (busy && rng.chance(0.35)) push('newsbox', ...at(14, 0.1), ry);
    if (d === 'beach' && rng.chance(0.5)) push('planter', ...at(rng.pick([-15, 15]), 0.2), ry);
  }
}

// Coral Beach (east shore): umbrellas, towels, loungers, lifeguard towers and volleyball nets.
function beach(city, rng) {
  const x0 = HALF + 16, x1 = ISLAND - 10;
  for (let z = -HALF + 30; z < HALF - 30; z += 120) {
    const zz = z + rng.range(-10, 10);
    if (Math.abs(zz - PIER_Z) < 30) continue;
    city.beachDecor.push({ type: 'tower', x: x1 - 8, z: zz, ry: Math.PI / 2, color: rng.pick([0xff6f61, 0x4cc9f0, 0xffd166, 0xff8fa3]) });
  }
  for (let k = 0; k < 70; k++) {
    const x = rng.range(x0 + 4, x1 - 14), z = rng.range(-HALF + 20, HALF - 20);
    if (Math.abs(z - PIER_Z) < 14) continue;
    const color = rng.pick([0xff5d73, 0xffd166, 0x4cc9f0, 0xffffff, 0x80ed99, 0xff9de2, 0xff8c42]);
    city.beachDecor.push({ type: 'towel', x: x + 1.8, z: z + rng.range(-0.5, 0.5), ry: rng.range(-0.3, 0.3), color: rng.pick([0xff5d73, 0x4cc9f0, 0xffd166, 0xc792ff, 0x80ed99]) });
    if (rng.chance(0.5)) city.beachDecor.push({ type: 'lounger', x: x - 1.6, z, ry: Math.PI / 2, color: 0xffffff });
    city.props.push({ umbrella: true, x, z, color });
  }
  for (const z of [-260, 200]) city.beachDecor.push({ type: 'volley', x: (x0 + x1) / 2, z, ry: 0, color: 0xffffff });
}

export const PIER_Z = -45; // the Coral Beach pier and its wheel stand off this z

// Wooden poles with sagging wires along the roads that bound Verde Hills.
function powerLines(city, districtOf) {
  const off = 9 + 1.0; // just off the road edge, on the kerb
  for (let j = 0; j <= N; j++) {
    const run = [];
    for (let i = 0; i < N; i++) {
      const hillsNear = (j < N && districtOf(i, j) === 'hills') || (j > 0 && districtOf(i, j - 1) === 'hills');
      if (!hillsNear) { if (run.length > 1) city.powerPoles.push(run.splice(0)); else run.length = 0; continue; }
      for (const t of [0.38, 0.88]) run.push({ x: nodeX(i) + PITCH * t, z: nodeZ(j) - off }); // between the street lamps
    }
    if (run.length > 1) city.powerPoles.push(run);
  }
  for (const run of city.powerPoles) for (const p of run) city.colliders.push({ x0: p.x - 0.25, x1: p.x + 0.25, z0: p.z - 0.25, z1: p.z + 0.25, h: 9, solid: true, pole: true });
}
