// Kerbside furniture (benches, bus shelters, hydrants, bins, scooters, news boxes, barriers, planters)
// merged into chunked meshes, plus wooden power poles with sagging wires through Verde Hills.
import * as THREE from 'three';
import { ChunkedGeo } from './geomkit.js';
import { addGlow } from './glowSprites.js';
import { makeRng } from './random.js';

const SCOOTER_COLORS = [0xff6f61, 0x4cc9f0, 0xffd166, 0xf1faee, 0x80ed99, 0xff9de2, 0x2b2d42];

// Each builder draws in a local frame where +z faces the road.
const PIECES = {
  bench(g) {
    for (const x of [-0.8, 0.8]) g.box(x, 0.24, 0, 0.08, 0.48, 0.5, 0x3a3f46);
    g.box(0, 0.5, 0, 1.9, 0.06, 0.5, 0xb57a45);
    g.box(0, 0.82, -0.24, 1.9, 0.38, 0.05, 0xb57a45);
  },
  busStop(g) {
    for (const x of [-1.9, 1.9]) g.box(x, 1.3, -0.65, 0.1, 2.6, 0.1, 0x6b7380);
    g.box(0, 2.65, 0, 4.2, 0.12, 1.7, 0xe8ecef);
    g.box(0, 1.35, -0.7, 3.7, 2.1, 0.05, 0xa9d6e8);
    g.box(-1.95, 1.35, -0.05, 0.05, 2.1, 1.2, 0xa9d6e8);
    g.box(0.4, 0.45, -0.45, 2.4, 0.08, 0.4, 0x8f979f);
    g.box(2.3, 1.6, 0.7, 0.08, 3.2, 0.08, 0x6b7380);
    g.box(2.3, 3.0, 0.7, 0.6, 0.6, 0.06, 0x2f80ed);
    g.box(-1.0, 1.35, -0.74, 1.4, 1.8, 0.04, 0xffd166); // poster
  },
  hydrant(g) {
    g.cylinder(0, 0.3, 0, 0.14, 0.6, 0xd62828, 'y', 8);
    g.cylinder(0, 0.64, 0, 0.11, 0.1, 0xf2c230, 'y', 8);
    g.cylinder(0, 0.38, 0, 0.06, 0.42, 0xd62828, 'x', 6);
  },
  bin(g) {
    g.cylinder(0, 0.45, 0, 0.28, 0.9, 0x2f6b4f, 'y', 10);
    g.cylinder(0, 0.93, 0, 0.31, 0.08, 0x264d3a, 'y', 10);
  },
  newsbox(g) {
    g.box(0, 0.5, 0, 0.5, 1.0, 0.45, 0x2f80ed);
    g.box(0, 0.75, 0.23, 0.38, 0.3, 0.02, 0xe8ecef);
  },
  barrier(g) {
    g.prism([[-0.3, 0], [0.3, 0], [0.12, 0.8], [-0.12, 0.8]], 3, 0xcfd3d6);
    g.box(0, 0.55, 0, 3, 0.12, 0.2, 0xf2c230);
  },
  planter(g) {
    g.box(0, 0.35, 0, 1.4, 0.7, 1.4, 0xe9e2d4);
    g.blob(0, 1.0, 0, 0.7, 0x3f8f43, 0.8, 1, 0.18, 4);
    g.blob(0.3, 1.3, 0.2, 0.4, 0xff6fb5, 0.8, 0, 0.2, 9);
  },
  scooter(g, rng) {
    const c = rng.pick(SCOOTER_COLORS);
    g.cylinder(0, 0.22, 0.55, 0.22, 0.1, 0x1c1c1c, 'x', 8);
    g.cylinder(0, 0.22, -0.55, 0.22, 0.1, 0x1c1c1c, 'x', 8);
    g.box(0, 0.38, -0.15, 0.36, 0.22, 0.9, c);
    g.box(0, 0.62, -0.3, 0.3, 0.14, 0.55, 0x222222);
    g.box(0, 0.62, 0.5, 0.34, 0.75, 0.16, c);
    g.box(0, 1.02, 0.55, 0.62, 0.05, 0.05, 0x333333);
  },
};

export function buildStreetFurniture(scene, city, mat) {
  const rng = makeRng(2718);
  const layer = new ChunkedGeo(270, -660);
  for (const f of city.furniture || []) {
    const draw = PIECES[f.type];
    if (!draw) continue;
    const g = layer.at(f.x, f.z);
    g.at(f.x, 0.18, f.z, f.ry);
    draw(g, rng);
    g.at(0, 0, 0, 0);
    if (f.type === 'busStop') addGlow(f.x, 2.5, f.z, 3.5, 0xdff4ff, 'night', 0.4);
  }
  layer.addTo(scene, mat);
  buildPowerLines(scene, city, mat);
}

function buildPowerLines(scene, city, mat) {
  const runs = city.powerPoles || [];
  if (!runs.length) return;
  const poles = new ChunkedGeo(270, -660);
  const wire = [];
  const H = 9.2, arm = 1.5;
  for (const run of runs) {
    for (const p of run) {
      const g = poles.at(p.x, p.z);
      g.cylinder(p.x, H / 2, p.z, 0.16, H, 0x6b4f3a, 'y', 6);
      g.box(p.x, H - 0.5, p.z, 0.16, 0.16, arm * 2 + 0.2, 0x5a4232);
      for (const s of [-1, 0, 1]) g.box(p.x, H - 0.33, p.z + s * arm, 0.1, 0.18, 0.1, 0xd9dde0);
      g.cylinder(p.x + 0.35, H - 1.6, p.z, 0.3, 0.8, 0x8a9096, 'y', 8); // transformer can
    }
    for (let k = 0; k + 1 < run.length; k++) {
      const a = run[k], b = run[k + 1];
      for (const s of [-1, 0, 1]) {
        const seg = 10;
        for (let i = 0; i < seg; i++) {
          const t0 = i / seg, t1 = (i + 1) / seg;
          const sag = (t) => 4 * t * (1 - t) * 1.1;
          wire.push(
            a.x + (b.x - a.x) * t0, H - 0.25 - sag(t0), a.z + s * arm + (b.z - a.z) * t0,
            a.x + (b.x - a.x) * t1, H - 0.25 - sag(t1), a.z + s * arm + (b.z - a.z) * t1,
          );
        }
      }
    }
  }
  poles.addTo(scene, mat);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1d1f22 }));
  scene.add(lines);
}
