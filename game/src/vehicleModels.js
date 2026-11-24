// Builds low-poly vehicle meshes for every archetype: cars, bus, motorcycle and speedboat.
// Each model: painted body, glass/trim, separately breakable head/tail lamps, steerable spinning wheels, a driver.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { VEHICLES } from './config.js';
import './vehicleDefs.js';

export const GLASS = 0x1c2a3a;
const DARK = 0x16181c;
const BLACK = 0x0b0c0e;
const CHROME = 0xc9ced6;
const PLATE = 0xeef0e8;
const HEAD = 0xfff4d0;
const TAIL = 0xff2a2a;
const AMBER = 0xffa31a;

// shared materials (vertex coloured, never tinted per vehicle)
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.35 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
const driverMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const geoCache = new Map();
function cached(key, build) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = build()));
  return g;
}

function wheelGeometry(r, w, rim) {
  return cached(`w${r}|${w}|${rim}`, () => {
    const gb = new GeoBuilder();
    gb.cylinder(0, 0, 0, r, w, 0x141414, 'x', 14, 0x1c1c1c);
    gb.cylinder(0, 0, 0, r * 0.62, w + 0.02, rim, 'x', 10, rim);
    gb.box(0, 0, 0, w + 0.04, r * 0.18, r * 0.9, 0x2a2d31); // spoke bar makes the spin readable
    return gb.build();
  });
}

function driverGeometry() {
  return cached('driver', () => {
    const gb = new GeoBuilder();
    gb.box(0, 0.25, 0, 0.5, 0.55, 0.28, 0x39465c);
    gb.box(0, 0.68, 0, 0.26, 0.28, 0.26, 0xd9a47c);
    gb.box(0, 0.84, -0.02, 0.27, 0.08, 0.27, 0x221a14);
    return gb.build();
  });
}

// Box registered as a lamp so it can be broken later. side: +1 left, -1 right, 0 centre.
function lampBox(gb, list, x, y, z, w, h, d, color) {
  const s = gb.pos.length / 3;
  gb.box(x, y, z, w, h, d, color);
  list.push({ s, e: gb.pos.length / 3, side: Math.abs(x) < 0.05 ? 0 : Math.sign(x), broken: false });
}

// Cylinder along local Z (exhausts, pipes).
function zCylinder(gb, x, y, z, r, len, color) {
  gb.at(x, y, z, Math.PI / 2);
  gb.cylinder(0, 0, 0, r, len, color, 'x', 8, BLACK);
  gb.at();
}

// ---------------------------------------------------------------- cars
// belt/roof heights, cabin z-extents (front-base, front-roof, rear-roof, rear-base), wheel radius and extras
const SHAPES = {
  compact: { belt: 0.82, roof: 1.32, cf0: 0.55, cf1: 0.05, cr1: -1.0, cr0: -1.55, wheel: 0.32, rim: 0x9aa2ab },
  sedan: { belt: 0.88, roof: 1.4, cf0: 0.75, cf1: 0.2, cr1: -0.95, cr0: -1.4, wheel: 0.34, rim: 0x9aa2ab },
  taxi: { belt: 0.88, roof: 1.42, cf0: 0.75, cf1: 0.2, cr1: -0.95, cr0: -1.45, wheel: 0.34, rim: 0x9aa2ab, taxi: true },
  sports: { belt: 0.72, roof: 1.12, cf0: 0.55, cf1: -0.15, cr1: -0.9, cr0: -1.25, wheel: 0.34, rim: CHROME, spoiler: true },
  muscle: { belt: 0.86, roof: 1.3, cf0: 0.3, cf1: -0.3, cr1: -1.15, cr0: -1.6, wheel: 0.37, rim: CHROME, scoop: true, stripes: true, longHood: true },
  supercar: { belt: 0.7, roof: 1.08, cf0: 0.85, cf1: 0.0, cr1: -0.95, cr0: -1.75, wheel: 0.36, rim: 0x2b2b30, wedge: true, wing: true },
  pickup: { belt: 1.02, roof: 1.85, cf0: 1.05, cf1: 0.5, cr1: -0.45, cr0: -0.55, wheel: 0.42, rim: 0x9aa2ab, bed: true },
  van: { belt: 1.0, roof: 2.4, cf0: 2.1, cf1: 1.85, cr1: -2.55, cr0: -2.65, wheel: 0.38, rim: 0x9aa2ab, box: true },
  cruiser: { belt: 0.9, roof: 1.45, cf0: 0.8, cf1: 0.25, cr1: -0.95, cr0: -1.45, wheel: 0.35, rim: 0x6a7078, bar: true },
  swat: { belt: 1.15, roof: 2.3, cf0: 1.95, cf1: 1.7, cr1: -2.7, cr0: -2.8, wheel: 0.45, rim: 0x3a3f46, bar: true, armor: true, box: true },
};

function buildCarParts(type, def, sh, parts) {
  const { body, trim, lights, tail, head: headLamps, tailLamps } = parts;
  const L = def.length, W = def.width;
  const hl = L / 2, y0 = 0.28, wr = sh.wheel;
  const wb = hl * 0.62;

  // lower hull: sloped hood and short deck, or a low wedge for the supercar
  const hull = sh.wedge
    ? [[-hl, y0 + 0.02], [hl - 0.15, y0 - 0.02], [hl, y0 + 0.2], [hl - 1.1, sh.belt - 0.04], [-hl + 0.25, sh.belt + 0.06], [-hl, sh.belt - 0.04]]
    : [[-hl, y0 + 0.05], [hl, y0 + 0.05], [hl, sh.belt - 0.14], [hl - 0.35, sh.belt - 0.02], [hl - (sh.longHood ? 1.6 : 1.0), sh.belt], [-hl + 0.4, sh.belt], [-hl, sh.belt - 0.1]];
  body.prism(hull, W, 0xffffff);

  const cw = W * (sh.wedge ? 0.84 : 0.9);
  if (sh.box) {
    body.prism([[sh.cr0, sh.belt], [sh.cf0 + 0.3, sh.belt], [sh.cf0 + 0.3, sh.roof], [sh.cr0, sh.roof]], W * 0.98, 0xffffff);
    trim.prism([[sh.cf1 - 0.3, sh.belt + 0.55], [sh.cf0 + 0.31, sh.belt + 0.55], [sh.cf0 + 0.31, sh.roof - 0.25], [sh.cf1 - 0.3, sh.roof - 0.25]], W * 0.99, GLASS);
    // rear doors seam and handles
    trim.box(0, (sh.belt + sh.roof) / 2, sh.cr0 - 0.005, 0.03, sh.roof - sh.belt - 0.2, 0.02, DARK);
    trim.box(0, sh.belt + 0.15, (sh.cr0 + sh.cf1) / 2, W + 0.01, 0.06, (sh.cf1 - sh.cr0) * 0.85, DARK);
  } else {
    trim.prism([[sh.cr0, sh.belt], [sh.cf0, sh.belt], [sh.cf1, sh.roof], [sh.cr1, sh.roof]], cw, GLASS);
    body.prism([[sh.cr1 - 0.05, sh.roof - 0.02], [sh.cf1 + 0.05, sh.roof - 0.02], [sh.cf1 + 0.05, sh.roof + 0.05], [sh.cr1 - 0.05, sh.roof + 0.05]], cw + 0.04, 0xffffff);
    const mz = (sh.cr0 + sh.cf0) / 2 - 0.15;
    body.box(0, (sh.belt + sh.roof) / 2, mz, cw + 0.03, sh.roof - sh.belt, 0.12, 0xffffff, { noTop: true });
    // mirrors
    for (const sx of [-1, 1]) {
      body.box(sx * (W / 2 + 0.09), sh.belt + 0.1, sh.cf0 - 0.15, 0.16, 0.1, 0.12, 0xffffff);
      trim.box(sx * (W / 2 + 0.1), sh.belt + 0.1, sh.cf0 - 0.22, 0.13, 0.08, 0.01, 0x8aa0b0);
    }
  }
  // door seams and handles on both flanks
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.006);
    const h = sh.belt - y0 - 0.22, y = (sh.belt + y0) / 2 + 0.06;
    trim.box(x, y, sh.cf0 - 0.05, 0.012, h, 0.025, DARK);
    trim.box(x, y, (sh.cr0 + sh.cf0) / 2 - 0.15, 0.012, h, 0.025, DARK);
    if (!sh.box && L > 4) trim.box(x, y, sh.cr0 + 0.1, 0.012, h, 0.025, DARK);
    trim.box(sx * (W / 2 + 0.02), sh.belt - 0.12, sh.cf0 - 0.45, 0.03, 0.04, 0.16, CHROME);
    // wheel arch shadows
    for (const sz of [-1, 1]) trim.box(sx * (W / 2 + 0.004), wr + 0.08, sz * wb, 0.012, wr * 1.05, wr * 2.35, BLACK);
  }
  if (sh.bed) {
    const bz0 = -hl + 0.05, bz1 = sh.cr0 - 0.1;
    body.box(0, sh.belt + 0.12, (bz0 + bz1) / 2, W, 0.28, bz1 - bz0, 0xffffff, { noTop: true });
    trim.box(0, sh.belt + 0.02, (bz0 + bz1) / 2, W - 0.3, 0.02, bz1 - bz0 - 0.3, 0x2a2a2e);
    trim.box(0, sh.roof + 0.04, (sh.cf1 + sh.cr1) / 2, W * 0.8, 0.05, 0.08, DARK); // roof rack bar
  }
  if (sh.spoiler) {
    body.box(0, sh.belt + 0.32, -hl + 0.15, W * 0.9, 0.06, 0.4, 0xffffff);
    body.box(W * 0.35, sh.belt + 0.18, -hl + 0.2, 0.06, 0.28, 0.12, 0xffffff);
    body.box(-W * 0.35, sh.belt + 0.18, -hl + 0.2, 0.06, 0.28, 0.12, 0xffffff);
  }
  if (sh.wing) {
    trim.box(0, sh.belt + 0.42, -hl + 0.2, W * 0.95, 0.05, 0.45, 0x1a1b1f);
    for (const sx of [-1, 1]) {
      trim.box(sx * W * 0.32, sh.belt + 0.2, -hl + 0.25, 0.05, 0.4, 0.14, 0x1a1b1f);
      trim.box(sx * (W / 2 + 0.005), sh.belt - 0.15, -0.6, 0.02, 0.26, 0.9, BLACK); // side intakes
      trim.box(sx * W * 0.47, sh.belt + 0.42, -hl + 0.2, 0.02, 0.18, 0.5, 0x1a1b1f);
    }
    trim.box(0, y0 + 0.08, -hl + 0.1, W * 0.8, 0.12, 0.3, 0x202226); // diffuser
  }
  if (sh.scoop) body.box(0, sh.belt + 0.07, hl - 1.1, W * 0.32, 0.14, 0.9, 0xffffff);
  if (sh.stripes) {
    for (const sx of [-0.14, 0.14]) {
      trim.box(sx, sh.belt + 0.012, hl - 0.85, 0.16, 0.012, 1.6, 0xf7f7f2);
      trim.box(sx, sh.roof + 0.057, (sh.cf1 + sh.cr1) / 2, 0.16, 0.012, sh.cf1 - sh.cr1, 0xf7f7f2);
      trim.box(sx, sh.belt + 0.012, -hl + 0.45, 0.16, 0.012, 0.75, 0xf7f7f2);
    }
  }
  if (sh.armor) {
    trim.box(0, sh.belt - 0.05, hl - 0.05, W, 0.35, 0.3, 0x2c3138);
    trim.box(0, 1.5, 0, W + 0.02, 0.18, L * 0.55, 0x2c3138);
    trim.box(0, sh.belt - 0.05, hl + 0.2, W * 0.9, 0.5, 0.1, 0x1a1d22); // push bar
  }
  if (sh.taxi) {
    // roof sign glows with the lamps; checker band down the flanks
    lampBox(lights, [], 0, sh.roof + 0.17, (sh.cf1 + sh.cr1) / 2, 0.75, 0.2, 0.28, 0xffe27a);
    trim.box(0, sh.roof + 0.07, (sh.cf1 + sh.cr1) / 2, 0.8, 0.04, 0.32, DARK);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 12; k++) {
        trim.box(sx * (W / 2 + 0.008), sh.belt - 0.2 + (k % 2) * 0.07, -1.5 + k * 0.25, 0.012, 0.07, 0.125, BLACK);
      }
    }
  }
  if (type === 'cruiser') {
    for (const sx of [-1, 1]) {
      trim.box(sx * (W / 2 + 0.012), (y0 + sh.belt) / 2 + 0.02, -0.15, 0.01, sh.belt - y0 - 0.25, 2.1, 0xf2f4f8);
      trim.box(sx * (W / 2 + 0.014), (y0 + sh.belt) / 2 + 0.05, -0.15, 0.01, 0.1, 1.9, 0x2c6bff);
    }
    trim.box(0, sh.belt + 0.02, hl - 0.8, W * 0.7, 0.012, 1.0, 0xf2f4f8);
    trim.box(0, sh.belt + 0.02, -hl + 0.7, W * 0.7, 0.012, 0.9, 0xf2f4f8);
    trim.box(0, y0 + 0.3, hl + 0.15, W * 0.6, 0.35, 0.08, BLACK); // push bar
  }

  // bumpers, grille, sills, plates, exhaust
  trim.box(0, y0 + 0.14, hl - 0.04, W + 0.04, 0.26, 0.2, DARK);
  trim.box(0, y0 + 0.14, -hl + 0.04, W + 0.04, 0.26, 0.2, DARK);
  trim.box(0, y0 + 0.5, hl + 0.01, W * 0.5, 0.18, 0.06, 0x0e0f12);
  for (let k = 0; k < 3; k++) trim.box(0, y0 + 0.44 + k * 0.05, hl + 0.045, W * 0.46, 0.012, 0.01, 0x5a5f66);
  trim.box(W / 2 + 0.005, y0 + 0.08, 0, 0.02, 0.1, L * 0.7, DARK);
  trim.box(-W / 2 - 0.005, y0 + 0.08, 0, 0.02, 0.1, L * 0.7, DARK);
  trim.box(0, y0 + 0.17, hl + 0.07, 0.42, 0.12, 0.01, PLATE);
  trim.box(0, y0 + 0.36, -hl - 0.02, 0.42, 0.12, 0.01, PLATE);
  const pipes = sh.wing || sh.stripes ? [-0.3, 0.3] : [-W * 0.3];
  for (const x of pipes) zCylinder(trim, x, y0 + 0.02, -hl - 0.02, 0.045, 0.25, 0x6a6e74);

  // lamps
  const slim = sh.wedge || type === 'sports';
  for (const sx of [-1, 1]) {
    lampBox(lights, headLamps, sx * W * 0.33, y0 + (slim ? 0.32 : 0.5), hl + 0.01, slim ? 0.5 : 0.38, slim ? 0.08 : 0.16, 0.06, HEAD);
    lights.box(sx * W * 0.45, y0 + 0.32, hl + 0.03, 0.12, 0.06, 0.03, AMBER);
    lampBox(tail, tailLamps, sx * W * 0.34, y0 + (sh.wedge ? 0.36 : 0.5), -hl - 0.01, sh.wedge ? 0.55 : 0.4, sh.wedge ? 0.07 : 0.14, 0.05, TAIL);
  }
  if (!sh.box && !sh.wedge) lampBox(tail, tailLamps, 0, sh.roof - 0.06, sh.cr0 + 0.08, 0.3, 0.04, 0.03, TAIL);

  parts.wheels = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    parts.wheels.push({ x: sx * (W / 2 - 0.08), y: wr, z: sz * wb, r: wr, w: 0.28, front: sz > 0 });
  }
  parts.rim = sh.rim;
  parts.driverPos = sh.box ? [W * 0.22, sh.belt - 0.5, sh.cf1 - 0.3] : [W * 0.22, sh.belt - 0.5, (sh.cf1 + sh.cr1) / 2 + 0.2];
  parts.barPos = sh.bar ? [0, sh.roof + 0.14, (sh.cf1 + sh.cr1) / 2] : null;
}

// ---------------------------------------------------------------- bus
function buildBusParts(def, parts) {
  const { body, trim, lights, tail, head: headLamps, tailLamps } = parts;
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2;
  body.prism([[-hl, 0.42], [hl, 0.42], [hl, H - 0.2], [hl - 0.25, H], [-hl + 0.2, H], [-hl, H - 0.2]], W, 0xffffff);
  // window band with pillars, windscreen, rear window
  trim.box(0, 1.95, -0.3, W + 0.02, 1.0, L - 2.2, GLASS);
  for (let z = -hl + 0.9; z < hl - 1.2; z += 1.35) body.box(0, 1.95, z, W + 0.04, 1.0, 0.12, 0xffffff);
  trim.box(0, 1.75, hl + 0.005, W - 0.2, 1.5, 0.02, GLASS);
  trim.box(0, 2.15, -hl - 0.005, W - 0.5, 0.7, 0.02, GLASS);
  // livery stripe, dark skirt, bumpers, door on the kerb side
  for (const sx of [-1, 1]) {
    trim.box(sx * (W / 2 + 0.012), 1.3, 0, 0.01, 0.16, L - 0.2, 0xffd166);
    trim.box(sx * (W / 2 + 0.012), 0.62, 0, 0.01, 0.32, L - 0.3, 0x1f2a30);
    for (const z of [hl - 1.6, -hl + 2.4]) trim.box(sx * (W / 2 + 0.006), 0.6, z, 0.012, 0.6, 1.35, BLACK);
  }
  trim.box(-W / 2 - 0.015, 1.5, hl - 1.0, 0.012, 2.0, 1.05, GLASS);
  trim.box(-W / 2 - 0.015, 1.5, -0.5, 0.012, 2.0, 1.05, GLASS);
  trim.box(0, 0.55, hl + 0.06, W + 0.04, 0.3, 0.14, DARK);
  trim.box(0, 0.55, -hl - 0.06, W + 0.04, 0.3, 0.14, DARK);
  trim.box(0, H + 0.12, -hl + 2.5, W * 0.7, 0.25, 2.2, 0xd8dbe0); // AC unit
  for (const sx of [-1, 1]) {
    trim.box(sx * (W / 2 + 0.12), 2.2, hl - 0.15, 0.06, 0.4, 0.06, DARK);
    lampBox(lights, headLamps, sx * W * 0.36, 0.85, hl + 0.01, 0.4, 0.18, 0.06, HEAD);
    lampBox(tail, tailLamps, sx * W * 0.4, 0.95, -hl - 0.01, 0.25, 0.5, 0.05, TAIL);
  }
  lights.box(0, H - 0.32, hl + 0.01, W * 0.7, 0.3, 0.04, AMBER); // destination sign
  parts.wheels = [];
  for (const sx of [1, -1]) {
    parts.wheels.push({ x: sx * (W / 2 - 0.12), y: 0.52, z: hl - 1.6, r: 0.52, w: 0.34, front: true });
    parts.wheels.push({ x: sx * (W / 2 - 0.12), y: 0.52, z: -hl + 2.4, r: 0.52, w: 0.34, front: false });
  }
  parts.rim = 0xc8c8c8;
  parts.driverPos = [W * 0.28, 0.85, hl - 1.0];
}

// ---------------------------------------------------------------- motorcycle
function buildBikeParts(def, parts) {
  const { body, trim, lights, tail, head: headLamps, tailLamps } = parts;
  const wr = 0.33, wb = 0.72;
  body.box(0, 0.98, 0.18, 0.34, 0.24, 0.55, 0xffffff); // tank
  body.prism([[-0.25, 0.92], [0.05, 0.92], [-0.2, 1.08], [-0.95, 1.12], [-1.02, 1.04]], 0.26, 0xffffff); // tail cowl
  body.prism([[0.42, 0.72], [0.82, 0.8], [0.88, 1.12], [0.62, 1.28], [0.42, 1.06]], 0.4, 0xffffff); // nose fairing
  trim.box(0, 0.62, 0.05, 0.32, 0.36, 0.5, 0x2a2c30); // engine
  for (let k = 0; k < 4; k++) trim.box(0, 0.5 + k * 0.08, 0.31, 0.36, 0.03, 0.04, 0x4a4e55); // fins
  trim.box(0, 1.08, -0.3, 0.28, 0.08, 0.6, BLACK); // seat
  trim.box(0, 0.48, -0.42, 0.08, 0.08, 0.7, 0x26282c); // swingarm
  trim.box(0, 0.4, 0.14, 0.24, 0.12, 0.3, 0x3a3d42); // sump
  trim.prism([[0.68, 1.25], [0.82, 1.18], [0.74, 1.45], [0.62, 1.42]], 0.34, 0x5b7286); // screen
  zCylinder(trim, -0.17, 0.52, -0.55, 0.06, 0.7, CHROME);
  lampBox(lights, headLamps, 0, 1.02, 0.89, 0.2, 0.13, 0.05, HEAD);
  lampBox(tail, tailLamps, 0, 1.02, -1.04, 0.18, 0.06, 0.05, TAIL);
  parts.wheels = [
    { x: 0, y: wr, z: wb, r: wr, w: 0.14, front: true, fork: true },
    { x: 0, y: wr, z: -wb, r: wr, w: 0.18, front: false },
  ];
  parts.rim = 0xd6a742;
  parts.driverPos = [0, 0.86, -0.22];
  parts.driverScale = 0.95;
}

function forkGeometry() {
  return cached('fork', () => {
    const gb = new GeoBuilder();
    for (const sx of [-1, 1]) {
      gb.at(sx * 0.09, 0, 0, 0);
      gb.box(0, 0.42, -0.1, 0.05, 0.7, 0.05, 0x9aa0a8);
    }
    gb.at();
    gb.box(0, 0.8, -0.2, 0.7, 0.04, 0.04, 0x1a1a1a); // handlebar
    gb.box(0, 0.2, 0, 0.16, 0.05, 0.5, 0x2a2c30); // mudguard
    return gb.build();
  });
}

// ---------------------------------------------------------------- speedboat
// Hull lofted from cross sections: [z, halfWidth, deckY, chineY, keelY]
const HULL = [[-3.2, 1.06, 0.72, -0.02, -0.38], [-1.6, 1.15, 0.72, -0.04, -0.46], [0.4, 1.12, 0.74, 0.0, -0.44], [2.0, 0.78, 0.82, 0.16, -0.22], [3.2, 0.06, 0.95, 0.62, 0.42]];

function buildBoatParts(def, parts) {
  const { body, trim, lights, tail, head: headLamps, tailLamps } = parts;
  const hint = [0, 0.2, 0];
  const pt = (s, side, which) => [side * s[1] * (which === 'keel' ? 0 : 1), which === 'deck' ? s[2] : which === 'chine' ? s[3] : s[4], s[0]];
  const tri = (gb, a, b, c, col) => gb.rawTri(a, b, c, col, null, hint);
  for (let k = 0; k < HULL.length - 1; k++) {
    const A = HULL[k], B = HULL[k + 1];
    for (const side of [-1, 1]) {
      // topsides (painted), bottom (antifouling), deck (teak)
      const a1 = pt(A, side, 'deck'), b1 = pt(B, side, 'deck'), a2 = pt(A, side, 'chine'), b2 = pt(B, side, 'chine');
      tri(body, a1, b1, b2, 0xffffff); tri(body, a1, b2, a2, 0xffffff);
      const a3 = pt(A, side, 'keel'), b3 = pt(B, side, 'keel');
      tri(trim, a2, b2, b3, 0x7a1f24); tri(trim, a2, b3, a3, 0x7a1f24);
      const ca = [0, A[2] + 0.01, A[0]], cb = [0, B[2] + 0.01, B[0]];
      const da = [side * A[1], A[2] + 0.01, A[0]], db = [side * B[1], B[2] + 0.01, B[0]];
      trim.rawTri(ca, da, db, k < 2 ? 0xb98a5a : 0xf2f2ee, null, [0, -5, 0]);
      trim.rawTri(ca, db, cb, k < 2 ? 0xb98a5a : 0xf2f2ee, null, [0, -5, 0]);
    }
  }
  // transom
  const S = HULL[0];
  for (const side of [-1, 1]) {
    body.rawTri([0, S[2], S[0]], [side * S[1], S[2], S[0]], [side * S[1], S[3], S[0]], 0xffffff, null, hint);
    body.rawTri([0, S[2], S[0]], [side * S[1], S[3], S[0]], [0, S[4], S[0]], 0xffffff, null, hint);
  }
  // stripe, windscreen, console, seats, rails, outboard
  for (const side of [-1, 1]) trim.box(side * 1.13, 0.5, -0.5, 0.02, 0.1, 3.6, 0x1d3557);
  trim.prism([[0.25, 0.75], [0.55, 0.75], [0.3, 1.25], [0.15, 1.25]], 1.9, 0x5b7286);
  trim.box(0.4, 0.95, -0.1, 0.5, 0.42, 0.5, 0xf2f2ee);
  for (const x of [-0.45, 0.4]) {
    trim.box(x, 0.88, -0.75, 0.55, 0.28, 0.55, 0xe8dcc0);
    trim.box(x, 1.15, -1.02, 0.55, 0.45, 0.12, 0xe8dcc0);
  }
  trim.box(0, 0.88, -2.3, 1.8, 0.3, 0.6, 0xe8dcc0); // rear bench
  for (const side of [-1, 1]) trim.box(side * 0.95, 0.95, 1.6, 0.04, 0.04, 1.6, CHROME);
  trim.box(0, 0.75, -3.4, 0.42, 0.75, 0.45, 0x1b1c20);
  trim.box(0, 0.2, -3.45, 0.12, 0.6, 0.2, 0x2a2c30);
  lampBox(lights, headLamps, 0, 1.0, 3.05, 0.12, 0.1, 0.12, HEAD);
  lampBox(tail, tailLamps, 0, 1.2, -3.35, 0.1, 0.1, 0.1, TAIL);
  parts.wheels = [];
  parts.rim = 0;
  parts.driverPos = [0.4, 0.62, -0.75];
}

// ---------------------------------------------------------------- assembly
export function buildVehicleModel(type, paint) {
  const def = VEHICLES[type];
  const parts = { body: new GeoBuilder(), trim: new GeoBuilder(), lights: new GeoBuilder(), tail: new GeoBuilder(), head: [], tailLamps: [] };
  if (type === 'bus') buildBusParts(def, parts);
  else if (def.kind === 'bike') buildBikeParts(def, parts);
  else if (def.kind === 'boat') buildBoatParts(def, parts);
  else buildCarParts(type, def, SHAPES[type] || SHAPES.sedan, parts);

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, color: paint, envMapIntensity: 1.2 });
  const headMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0x883333 });
  const bodyMesh = new THREE.Mesh(parts.body.build(), bodyMat);
  const trimMesh = new THREE.Mesh(parts.trim.build(), trimMat);
  const headMesh = new THREE.Mesh(parts.lights.build(), headMat);
  const tailMesh = new THREE.Mesh(parts.tail.build(), tailMat);
  bodyMesh.castShadow = trimMesh.castShadow = true;
  group.add(bodyMesh, trimMesh, headMesh, tailMesh);

  const wheels = [];
  for (const w of parts.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.z);
    const mesh = new THREE.Mesh(wheelGeometry(w.r, w.w, parts.rim), wheelMat);
    mesh.castShadow = true;
    pivot.add(mesh);
    if (w.fork) pivot.add(new THREE.Mesh(forkGeometry(), trimMat));
    group.add(pivot);
    wheels.push({ pivot, mesh, front: w.front, baseX: w.x, side: Math.sign(w.x), z: w.z, bent: 0 });
  }

  const driver = new THREE.Mesh(driverGeometry(), driverMat);
  driver.position.set(...parts.driverPos);
  driver.scale.setScalar(parts.driverScale ?? 0.85);
  driver.visible = false;
  group.add(driver);

  let bar = null;
  if (parts.barPos) {
    const geoA = cached('barA', () => { const g = new GeoBuilder(); g.box(-0.32, 0, 0, 0.6, 0.12, 0.25, 0xffffff); return g.build(); });
    const geoB = cached('barB', () => { const g = new GeoBuilder(); g.box(0.32, 0, 0, 0.6, 0.12, 0.25, 0xffffff); return g.build(); });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2a55ff, toneMapped: false });
    const a = new THREE.Mesh(geoA, redMat), b = new THREE.Mesh(geoB, blueMat);
    a.position.set(...parts.barPos);
    b.position.copy(a.position);
    group.add(a, b);
    bar = { redMat, blueMat };
  }

  const wheelRadius = parts.wheels[0]?.r ?? 1;
  return {
    group, bodyMat, trimMat, headMat, tailMat, wheels, driver, bar, bodyMesh, trimMesh, headMesh, tailMesh, wheelRadius, def,
    lamps: { head: parts.head, tail: parts.tailLamps },
    ownedGeos: [bodyMesh.geometry, trimMesh.geometry, headMesh.geometry, tailMesh.geometry],
    ownedMats: [bodyMat, headMat, tailMat, ...(bar ? [bar.redMat, bar.blueMat] : [])],
  };
}

export function setPaint(model, color) {
  model.bodyMat.color.set(color);
}

export function disposeVehicleModel(model) {
  for (const g of model.ownedGeos) g.dispose();
  for (const m of model.ownedMats) m.dispose();
}
