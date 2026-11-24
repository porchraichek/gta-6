// Procedural layout of Palmera Bay: districts, lots, buildings, landmarks and street furniture (pure data, no meshes).
import { N, BLOCK, PITCH, HALF, ISLAND } from './config.js';
import { makeRng } from './random.js';
import { nodeX, nodeZ } from './roadnet.js';
import { dressCity } from './cityDressing.js';

export const blockCX = (i) => -HALF + (i + 0.5) * PITCH;
export const blockCZ = (j) => -HALF + (j + 0.5) * PITCH;

export function districtOf(i, j) {
  if ((i === 2 && j === 8) || (i === 3 && j === 8) || (i === 9 && j === 5) || (i === 0 && j === 8)) return 'park';
  if (i >= 10) return 'beach';
  if (i <= 3 && j <= 6) return 'hills';
  if (j >= 9 && i <= 9) return 'harbor';
  if (i >= 4 && i <= 8 && j >= 3 && j <= 7) return 'downtown';
  return 'midtown';
}

// Named places the story and activities use. `side` says which road edge faces the entrance marker.
export const LANDMARKS = {
  diner: { block: [10, 6], name: 'Seagull Diner', sign: 'SEAGULL DINER', color: '#ff8fa3', tall: 9 },
  garage: { block: [3, 7], name: 'Okafor Auto', sign: 'OKAFOR AUTO', color: '#ffd166', tall: 8 },
  arms: { block: [6, 8], name: "Gunnar's Arms", sign: "GUNNAR'S ARMS", color: '#ff5d5d', tall: 8 },
  spray: { block: [8, 8], name: "Pay'n'Spray", sign: "PAY'N'SPRAY", color: '#6ee7ff', tall: 7 },
  hospital: { block: [9, 7], name: 'St. Aurelia Hospital', sign: 'HOSPITAL', color: '#ffffff', tall: 22 },
  police: { block: [6, 3], name: 'Palmera PD', sign: 'PALMERA PD', color: '#7aa8ff', tall: 16 },
  casino: { block: [5, 4], name: 'Lucky Palm Casino', sign: 'LUCKY PALM', color: '#ff4fd8', tall: 48 },
  bank: { block: [7, 5], name: 'Palmera Trust', sign: 'PALMERA TRUST', color: '#7cf29a', tall: 34 },
  yacht: { block: [11, 1], name: 'Bellamy Yacht Club', sign: 'YACHT CLUB', color: '#f4f1de', tall: 10 },
  docks: { block: [2, 11], name: 'Dock 9 Warehouse', sign: 'DOCK 9', color: '#ffb347', tall: 12 },
  villa: { block: [1, 1], name: 'Hale Villa', sign: 'HALE', color: '#e0c36a', tall: 12 },
  race: { block: [4, 9], name: 'Neon Lap Garage', sign: 'NEON LAP', color: '#b388ff', tall: 9 },
};

const WALL_PASTELS = [0xf6e0c8, 0xf4b6a6, 0xa6dcd5, 0xf2d27d, 0xeef0f3, 0xe6b0cc, 0xbcd7ea, 0xf7c59f, 0xd9e4b0];
const GLASS_TINTS = [0xa8d8f0, 0x8fc3dc, 0xb7cad6, 0x9fd6c9, 0xc3b5e8];
const WAREHOUSE = [0xa7b0b8, 0xc9a37a, 0x8a9fb5, 0xb9b0a0, 0xd0d4d8];
const ROOF = [0x8e8e94, 0xa89b8c, 0x777b82, 0xb4503c];
const CONTAINER = [0xd64545, 0x2d6fbd, 0xe9a23b, 0x3a9d6e, 0x8a5fb8, 0xe8e2d0];

export function generateCity(seed = 20260101) {
  const rng = makeRng(seed);
  const city = {
    blocks: [],
    buildings: [], // {x,z,w,d,h,color,glass,roof,ridgeAlongX,tiers,special}
    colliders: [], // static AABBs
    palms: [],
    trees: [],
    lamps: [],
    signs: [], // {x,y,z,w,h,ry,text,color}
    containers: [],
    pools: [], // water patches {x,z,w,d,color}
    props: [], // misc boxes {x,y,z,w,h,d,color}
    landmarks: {},
    parks: [],
  };

  const addBuilding = (b) => {
    city.buildings.push(b);
    city.colliders.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: b.h, solid: true });
  };

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = blockCX(i), cz = blockCZ(j);
      const district = districtOf(i, j);
      const special = Object.entries(LANDMARKS).find(([, l]) => l.block[0] === i && l.block[1] === j);
      const block = { i, j, cx, cz, district, special: special?.[0] };
      city.blocks.push(block);

      if (special) {
        const [id, lm] = special;
        buildSpecial(city, id, lm, cx, cz, district, rng, addBuilding);
        city.landmarks[id] = {
          id,
          name: lm.name,
          // entrance marker on the sidewalk facing the south road
          x: cx,
          z: cz + BLOCK / 2 - 2,
          bx: cx,
          bz: cz,
          roadX: cx,
          roadZ: cz + BLOCK / 2 + 9,
          block: [i, j],
        };
        continue;
      }
      switch (district) {
        case 'downtown': genDowntown(city, cx, cz, rng, addBuilding); break;
        case 'midtown': genMidtown(city, cx, cz, rng, addBuilding); break;
        case 'beach': genBeach(city, cx, cz, rng, addBuilding); break;
        case 'harbor': genHarbor(city, cx, cz, rng, addBuilding, i, j); break;
        case 'hills': genHills(city, cx, cz, rng, addBuilding); break;
        case 'park': genPark(city, cx, cz, rng); break;
      }
    }
  }

  streetFurniture(city, rng);
  dressCity(city, districtOf);
  return city;
}

function pickWall(rng) {
  return rng.pick(WALL_PASTELS);
}

function genDowntown(city, cx, cz, rng, add) {
  if (rng.chance(0.4)) {
    const tw = rng.range(40, 52), td = rng.range(40, 52), h = rng.range(110, 190);
    add({
      x: cx, z: cz, w: tw, d: td, h, color: rng.pick(GLASS_TINTS), glass: true, roof: 'tiers', tiers: [{ f: 0.78, hf: 0.2 }, { f: 0.55, hf: 0.1 }],
      podium: { w: 64, d: 64, h: 12, color: 0xd9d2c3 },
    });
    city.props.push({ x: cx, y: 0, z: cz, antenna: h });
  } else {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (rng.chance(0.12)) continue;
        const w = rng.range(24, 30), d = rng.range(24, 30), h = rng.range(35, 115);
        add({ x: cx + sx * 17, z: cz + sz * 17, w, d, h, color: rng.chance(0.65) ? rng.pick(GLASS_TINTS) : pickWall(rng), glass: rng.chance(0.65), roof: rng.chance(0.4) ? 'tiers' : 'flat', tiers: [{ f: 0.7, hf: 0.12 }] });
      }
    }
  }
  if (rng.chance(0.5)) city.signs.push({ x: cx + rng.range(-20, 20), y: 0, z: cz, ad: true });
}

function genMidtown(city, cx, cz, rng, add) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (rng.chance(0.1)) {
        city.props.push({ x: cx + sx * 16, y: 0.2, z: cz + sz * 16, w: 20, h: 0.3, d: 20, color: 0x9a9890 });
        city.palms.push([cx + sx * 16, cz + sz * 16]);
        continue;
      }
      const w = rng.range(21, 28), d = rng.range(21, 28), h = rng.range(9, 38);
      add({ x: cx + sx * 17, z: cz + sz * 17, w, d, h, color: pickWall(rng), glass: rng.chance(0.2), roof: 'flat' });
    }
  }
}

function genBeach(city, cx, cz, rng, add) {
  const cols = [0xf8d5c9, 0xcfeee6, 0xfbe8a6, 0xf4c1d4, 0xffffff];
  for (const sz of [-1, 1]) {
    const w = rng.range(26, 32), d = rng.range(24, 28), h = rng.range(10, 26);
    add({ x: cx + rng.range(-8, 8), z: cz + sz * 18, w, d, h, color: rng.pick(cols), glass: false, roof: 'flat', balcony: true });
  }
  city.pools.push({ x: cx, z: cz, w: 10, d: 6, color: 0x4fd6ff });
  for (let k = 0; k < 3; k++) city.palms.push([cx + rng.range(-30, 30), cz + rng.range(-4, 4)]);
}

function genHarbor(city, cx, cz, rng, add, i, j) {
  const outer = j === 11;
  add({ x: cx, z: cz - 18, w: 60, d: 24, h: rng.range(9, 13), color: rng.pick(WAREHOUSE), glass: false, roof: 'sawtooth', ridgeAlongX: true });
  // container yard
  for (let k = 0; k < 9; k++) {
    const ix = k % 3, iz = Math.floor(k / 3);
    const stack = rng.int(1, 3);
    if (rng.chance(0.2)) continue;
    for (let s = 0; s < stack; s++) {
      const bx = cx - 20 + ix * 20 + rng.range(-1, 1), bz = cz + 10 + iz * 7;
      city.containers.push({ x: bx, y: 1.3 + s * 2.6, z: bz, w: 12.2, h: 2.6, d: 2.5, color: rng.pick(CONTAINER) });
    }
    const top = stack * 2.6;
    city.colliders.push({ x0: cx - 20 + ix * 20 - 6.2, x1: cx - 20 + ix * 20 + 6.2, z0: cz + 10 + iz * 7 - 1.4, z1: cz + 10 + iz * 7 + 1.4, h: top, solid: true });
  }
  if (outer && rng.chance(0.6)) city.props.push({ x: cx + 24, z: cz + 30, crane: true });
}

function genHills(city, cx, cz, rng, add) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      if (sz === 0 && sx === 1 && rng.chance(0.5)) {
        city.pools.push({ x: cx + 10, z: cz, w: 9, d: 5, color: 0x4fd6ff });
        continue;
      }
      const hx = cx + sx * 17 + rng.range(-2, 2), hz = cz + sz * 22 + rng.range(-1, 1);
      const w = rng.range(13, 17), d = rng.range(11, 14), h = rng.range(5.5, 8);
      add({ x: hx, z: hz, w, d, h, color: pickWall(rng), glass: false, roof: 'gable', ridgeAlongX: rng.chance(0.5), roofColor: rng.pick([0xb4503c, 0xa8442f, 0x6b4a3a, 0xc0653f]) });
      city.trees.push([hx + sx * 11, hz + rng.range(-5, 5), rng.range(0.9, 1.4)]);
      if (rng.chance(0.5)) city.palms.push([hx - sx * 9, hz + 9]);
    }
  }
}

function genPark(city, cx, cz, rng) {
  city.parks.push({ x: cx, z: cz });
  for (let k = 0; k < 26; k++) {
    const x = cx + rng.range(-31, 31), z = cz + rng.range(-31, 31);
    if (Math.hypot(x - cx, z - cz) < 12) continue;
    if (rng.chance(0.5)) city.palms.push([x, z]);
    else city.trees.push([x, z, rng.range(0.9, 1.5)]);
  }
  city.pools.push({ x: cx, z: cz, w: 18, d: 12, color: 0x39b6d8, round: true });
}

function buildSpecial(city, id, lm, cx, cz, district, rng, add) {
  const col = new Map([
    ['casino', 0x2b2140], ['bank', 0xe8e6df], ['police', 0x6f86ad], ['hospital', 0xf2f4f6], ['arms', 0x8a3b32], ['spray', 0x4fa3b8],
    ['diner', 0xf8c7c1], ['garage', 0xe0b84a], ['yacht', 0xf4f1de], ['docks', 0xb9b0a0], ['villa', 0xf2e2b5], ['race', 0x5b3e8c],
  ]);
  const color = col.get(id) ?? 0xdddddd;
  const tall = lm.tall;
  if (id === 'villa') {
    add({ x: cx, z: cz - 8, w: 44, d: 28, h: 12, color, glass: false, roof: 'flat', balcony: true });
    city.pools.push({ x: cx, z: cz + 14, w: 22, d: 9, color: 0x4fd6ff });
    for (const sx of [-26, 26]) city.palms.push([cx + sx, cz + 20]);
  } else if (id === 'casino') {
    add({ x: cx, z: cz, w: 52, d: 44, h: tall, color, glass: true, roof: 'tiers', tiers: [{ f: 0.6, hf: 0.3 }], podium: { w: 64, d: 60, h: 8, color: 0x3b2e5a } });
  } else if (id === 'bank') {
    add({ x: cx, z: cz, w: 40, d: 36, h: tall, color: 0xc9d3dc, glass: true, roof: 'flat' });
  } else if (id === 'yacht') {
    add({ x: cx - 6, z: cz - 6, w: 40, d: 24, h: tall, color, glass: false, roof: 'flat', balcony: true });
    city.pools.push({ x: cx + 8, z: cz + 22, w: 40, d: 8, color: 0x2fb4d6 });
  } else if (id === 'docks') {
    add({ x: cx, z: cz - 8, w: 62, d: 40, h: tall, color, glass: false, roof: 'sawtooth', ridgeAlongX: true });
  } else if (id === 'hospital') {
    add({ x: cx, z: cz - 4, w: 50, d: 36, h: tall, color, glass: false, roof: 'flat' });
    city.props.push({ x: cx, y: tall + 0.2, z: cz - 4, w: 10, h: 0.2, d: 10, color: 0xe63946, heli: true });
  } else if (id === 'police') {
    add({ x: cx, z: cz - 4, w: 46, d: 34, h: tall, color, glass: false, roof: 'flat' });
  } else {
    add({ x: cx, z: cz - 6, w: 48, d: 30, h: tall, color, glass: false, roof: 'flat' });
  }
  const b = city.buildings[city.buildings.length - 1];
  b.special = id;
  b.signColor = lm.color;
  city.signs.push({ x: b.x, y: Math.min(b.h - 2, 7), z: b.z + b.d / 2 + 0.15, w: Math.min(b.w - 4, 26), h: 4.4, ry: 0, text: lm.sign, color: lm.color, landmark: id });
  if (district === 'beach' || id === 'villa') city.palms.push([cx - 28, cz + 24], [cx + 28, cz + 24]);
}

function streetFurniture(city, rng) {
  // lamps along block edges, palms along avenues and the beach ring
  for (const b of city.blocks) {
    const e = BLOCK / 2 - 1.4;
    for (const t of [-22, 0, 22]) {
      if (b.district === 'park' && t === 0) continue;
      city.lamps.push([b.cx + t, b.cz + e, 0], [b.cx + t, b.cz - e, Math.PI], [b.cx + e, b.cz + t, Math.PI / 2], [b.cx - e, b.cz + t, -Math.PI / 2]);
    }
    if (b.district !== 'harbor' && b.district !== 'hills') {
      for (const t of [-30, 30]) {
        city.palms.push([b.cx + t, b.cz + e - 1.2]);
        city.palms.push([b.cx + t, b.cz - e + 1.2]);
      }
    }
  }
  // outer beach ring: palms and umbrellas
  for (let k = -ISLAND + 20; k < ISLAND - 20; k += 24) {
    if (rng.chance(0.7)) city.palms.push([HALF + 30 + rng.range(0, 25), k]);
    if (rng.chance(0.25)) city.palms.push([-HALF - 30 - rng.range(0, 25), k]);
    if (rng.chance(0.25)) city.palms.push([k, -HALF - 30 - rng.range(0, 25)]);
  }
  // (beach umbrellas are placed by cityDressing; these draws keep the seeded layout stable)
  for (let k = 0; k < 40; k++) { rng.range(0, 40); rng.range(-HALF + 20, HALF - 20); rng.pick([0]); }
  // palm and lamp colliders (thin posts)
  for (const [x, z] of city.palms) city.colliders.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, h: 8, solid: true, pole: true });
  for (const [x, z] of city.lamps) city.colliders.push({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25, h: 8, solid: true, pole: true });
}

// Spawn-friendly helper: block centre of a district.
export function blocksOf(city, district) {
  return city.blocks.filter((b) => b.district === district);
}

export { nodeX, nodeZ };
