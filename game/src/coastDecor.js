// Coral Beach dressing: striped umbrellas, towels, loungers, lifeguard towers, volleyball nets, and the
// Palmera Pier boardwalk with its kiosks and slowly turning "Sun Wheel" (the city's seaside landmark).
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { addGlow } from './glowSprites.js';
import { nightGlow, WORLD } from './worldUniforms.js';
import { PIER_Z } from './cityDressing.js';
import { ISLAND } from './config.js';
import { makeRng } from './random.js';

const BEACH_PIECES = {
  tower(g, d) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.box(x, 1.1, z, 0.16, 2.2, 0.16, 0xf4f1ea);
    g.box(0, 2.25, 0.3, 3, 0.15, 3, 0xd8c7a0);
    g.box(0, 3.25, 0, 2.4, 1.9, 2.0, d.color);
    g.box(0, 3.4, 1.01, 2.0, 0.8, 0.04, 0x2a3a4a);
    g.box(0, 2.6, 1.01, 2.4, 0.22, 0.05, 0xffffff);
    g.prism([[-1.3, 4.2], [1.3, 4.2], [0, 5.0]], 2.8, 0xf4f1ea);
    g.box(0, 2.4, 1.85, 2.6, 0.08, 0.08, 0xf4f1ea);
    g.prism([[1.8, 2.25], [1.8, 2.1], [4.6, 0.0], [4.6, 0.15]], 1.0, 0xd8c7a0, 0.6);
    g.cylinder(1.4, 5.6, -0.8, 0.05, 2.2, 0xdddddd, 'y', 4);
    g.box(1.75, 6.4, -0.8, 0.7, 0.45, 0.03, 0xe63946);
  },
  towel(g, d) {
    g.box(0, 0.02, 0, 0.9, 0.02, 1.8, d.color);
    g.box(0, 0.035, 0.5, 0.9, 0.01, 0.18, 0xffffff);
    g.box(0, 0.035, -0.5, 0.9, 0.01, 0.18, 0xffffff);
  },
  lounger(g) {
    g.box(0, 0.32, 0.3, 0.7, 0.06, 1.3, 0xf4f1ea);
    g.prism([[-0.35, 0.32], [-0.95, 0.9], [-0.98, 0.84], [-0.4, 0.28]], 0.7, 0xf4f1ea);
    for (const z of [-0.3, 0.85]) for (const x of [-0.3, 0.3]) g.box(x, 0.16, z, 0.05, 0.32, 0.05, 0xbfc4c9);
  },
  volley(g) {
    for (const x of [-5, 5]) g.cylinder(x, 1.25, 0, 0.06, 2.5, 0xf4f1ea, 'y', 5);
    g.box(0, 2.1, 0, 10, 0.8, 0.03, 0x22262b);
    g.box(0, 2.48, 0, 10, 0.07, 0.04, 0xffffff);
  },
};

function umbrellaGeometries() {
  const tint = new GeoBuilder(), plain = new GeoBuilder();
  plain.cylinder(0, 1.25, 0, 0.035, 2.5, 0xeeeeee, 'y', 5);
  const seg = 10, r = 1.55, apex = [0, 2.6, 0];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const p0 = [Math.cos(a0) * r, 2.1, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 2.1, Math.sin(a1) * r];
    const g = k % 2 ? plain : tint;
    g.rawTri(apex, p1, p0, 0xffffff, null, [0, 0, 0]);
    g.rawTri(apex, p0, p1, 0xffffff, null, [0, 9, 0]); // underside
    const f0 = [p0[0] * 1.01, 1.95, p0[2] * 1.01], f1 = [p1[0] * 1.01, 1.95, p1[2] * 1.01];
    g.rawTri(p0, f0, f1, 0xffffff, null, [0, 2.4, 0]);
    g.rawTri(p0, f1, p1, 0xffffff, null, [0, 2.4, 0]);
  }
  return { tint: tint.build(), plain: plain.build() };
}

function placeInstanced(scene, geo, mat, items, withColor) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(it.tilt || 0, it.ry || 0, 0));
    m.compose(p.set(it.x, 0, it.z), q, one);
    mesh.setMatrixAt(i, m);
    if (withColor) mesh.setColorAt(i, new THREE.Color(it.color));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function buildCoast(scene, city, mat) {
  const rng = makeRng(321);
  const umbrellas = city.props.filter((p) => p.umbrella).map((u) => ({ ...u, ry: rng() * 6.28, tilt: (rng() - 0.5) * 0.25 }));
  if (umbrellas.length) {
    const g = umbrellaGeometries();
    const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    placeInstanced(scene, g.tint, cloth, umbrellas, true);
    placeInstanced(scene, g.plain, cloth, umbrellas, false);
  }
  const gb = new GeoBuilder();
  for (const d of city.beachDecor || []) {
    gb.at(d.x, 0, d.z, d.ry);
    BEACH_PIECES[d.type]?.(gb, d);
  }
  gb.at(0, 0, 0, 0);
  buildPier(scene, gb, mat);
  const m = new THREE.Mesh(gb.build(), mat);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

const DECK_Y = 2.4, PIER_W = 12;
const PIER_X0 = ISLAND - 30, PIER_X1 = ISLAND + 170;
const WHEEL = { x: ISLAND + 138, r: 21, axle: DECK_Y + 27.5 };

function buildPier(scene, gb, mat) {
  const z = PIER_Z, len = PIER_X1 - PIER_X0, cx = (PIER_X0 + PIER_X1) / 2;
  // planked deck: alternating plank tones, with a ramp down to the sand
  for (let x = PIER_X0; x < PIER_X1; x += 1.2) {
    gb.box(x + 0.6, DECK_Y, z, 1.15, 0.3, PIER_W, (Math.floor(x / 1.2) % 3) ? 0xa47a52 : 0x94693f);
  }
  gb.quad([PIER_X0 - 14, 0.05, z + PIER_W / 2 - 3], [PIER_X0, DECK_Y + 0.15, z + PIER_W / 2 - 3], [PIER_X0, DECK_Y + 0.15, z - PIER_W / 2 + 3], [PIER_X0 - 14, 0.05, z - PIER_W / 2 + 3], 0x94693f); // ramp
  // piles and cross beams
  for (let x = PIER_X0 + 4; x < PIER_X1; x += 8) {
    for (const s of [-1, 1]) gb.cylinder(x, DECK_Y / 2 - 2, z + s * (PIER_W / 2 - 0.6), 0.35, DECK_Y + 4, 0x5a4232, 'y', 6);
    gb.box(x, DECK_Y - 0.4, z, 0.4, 0.4, PIER_W, 0x5a4232);
  }
  // railings and lamp posts
  for (const s of [-1, 1]) {
    const zz = z + s * (PIER_W / 2 - 0.1);
    gb.box(cx, DECK_Y + 1.1, zz, len, 0.1, 0.1, 0xf4f1ea);
    gb.box(cx, DECK_Y + 0.6, zz, len, 0.06, 0.06, 0xf4f1ea);
    for (let x = PIER_X0; x <= PIER_X1; x += 3) gb.box(x, DECK_Y + 0.6, zz, 0.1, 1.1, 0.1, 0xf4f1ea);
    for (let x = PIER_X0 + 10; x < PIER_X1; x += 20) {
      gb.cylinder(x, DECK_Y + 2.2, zz, 0.07, 4.4, 0x2d3a4a, 'y', 6);
      gb.box(x, DECK_Y + 4.5, zz, 0.45, 0.45, 0.45, 0xfff1c9);
      addGlow(x, DECK_Y + 4.5, zz, 5, 0xffd08a, 'night', 0.7);
    }
  }
  // kiosks along the deck
  const kiosks = [[PIER_X0 + 30, 0xff6fb5], [PIER_X0 + 58, 0x4cc9f0], [PIER_X0 + 86, 0xffd166]];
  for (const [x, col] of kiosks) {
    const zz = z - PIER_W / 2 + 2.4;
    gb.box(x, DECK_Y + 1.4, zz, 4, 2.6, 3, 0xf7f2e8);
    gb.box(x, DECK_Y + 1.2, zz + 1.52, 3.2, 1.0, 0.05, 0x2a3a4a);
    gb.at(x, DECK_Y + 2.9, zz + 1.5, 0);
    for (let k = 0; k < 5; k++) gb.prism([[0, 0], [1.2, -0.5], [1.2, -0.6], [0, -0.1]], 0.8, k % 2 ? 0xffffff : col, -1.6 + k * 0.8);
    gb.at(0, 0, 0, 0);
    gb.box(x, DECK_Y + 3.3, zz, 4.2, 0.4, 3.2, col);
    addGlow(x, DECK_Y + 2.4, zz + 1.8, 5, col, 'night', 0.4);
  }
  // wheel supports: A-frames on both sides of the hub
  const wx = WHEEL.x;
  for (const s of [-1, 1]) {
    const hub = [wx, WHEEL.axle, z + s * 2.2];
    gb.beam([wx - 9, DECK_Y, z + s * 4.5], hub, 0.9, 0xf4f1ea);
    gb.beam([wx + 9, DECK_Y, z + s * 4.5], hub, 0.9, 0xf4f1ea);
  }
  gb.box(wx, DECK_Y + 1.2, z, 8, 2.4, 6, 0xffffff);
  gb.box(wx, DECK_Y + 2.5, z, 8.4, 0.3, 6.4, 0xff6fb5);
  buildWheel(scene, z);
  addGlow(wx, WHEEL.axle, z, 14, 0xff9de2, 'night', 0.35);
}

// The wheel turns in the x-y plane (its face looks along z, toward the beach-side road and the pier walkway).
function buildWheel(scene, z) {
  const frame = new GeoBuilder(), bulbs = new GeoBuilder();
  const n = 18, r = WHEEL.r;
  for (const s of [-1.3, 1.3]) {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [Math.cos(a0) * r, Math.sin(a0) * r, s], p1 = [Math.cos(a1) * r, Math.sin(a1) * r, s];
      frame.beam(p0, p1, 0.45, 0xffffff);
      frame.beam([0, 0, s * 0.6], p0, 0.18, 0xe8ecef);
      const q0 = [p0[0] * 0.72, p0[1] * 0.72, s], q1 = [p1[0] * 0.72, p1[1] * 0.72, s];
      frame.beam(q0, q1, 0.2, 0xe8ecef);
      for (let b = 0; b < 3; b++) {
        const t = (b + 0.5) / 3, bx = p0[0] + (p1[0] - p0[0]) * t, by = p0[1] + (p1[1] - p0[1]) * t;
        bulbs.box(bx * 1.02, by * 1.02, s * 1.15, 0.35, 0.35, 0.2, [0xff4fd8, 0x6ee7ff, 0xffd166][(k + b) % 3]);
      }
      if (s > 0) frame.beam(p0, [p0[0], p0[1], -s], 0.2, 0xe8ecef);
    }
  }
  frame.beam([0, 0, -2.2], [0, 0, 2.2], 1.8, 0xff6fb5); // hub
  const wheel = new THREE.Group();
  const frameMesh = new THREE.Mesh(frame.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }));
  frameMesh.castShadow = true;
  const bulbMesh = new THREE.Mesh(bulbs.build(), nightGlow(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 0.8, 3.0, 'wheelBulbs'));
  wheel.add(frameMesh, bulbMesh);
  wheel.position.set(WHEEL.x, WHEEL.axle, z);
  scene.add(wheel);

  // gondolas stay level while the wheel turns
  const gond = new GeoBuilder();
  gond.box(0, -1.6, 0, 2.2, 1.8, 2.0, 0xffffff);
  gond.box(0, -0.55, 0, 2.5, 0.25, 2.3, 0xff6fb5);
  gond.box(0, -1.4, 1.01, 1.8, 0.8, 0.02, 0x2a3a4a);
  gond.box(0, -1.4, -1.01, 1.8, 0.8, 0.02, 0x2a3a4a);
  gond.box(0, -0.2, 0, 0.12, 0.6, 0.12, 0x888888);
  const cars = new THREE.InstancedMesh(gond.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
  const palette = [0x4cc9f0, 0xffd166, 0xff6fb5, 0x80ed99, 0xc792ff, 0xff9a6b];
  for (let k = 0; k < n; k++) cars.setColorAt(k, new THREE.Color(palette[k % palette.length]));
  cars.frustumCulled = false;
  cars.castShadow = true;
  scene.add(cars);
  const m = new THREE.Matrix4();
  let lastT = -1;
  cars.onBeforeRender = () => {
    const t = WORLD.uTime.value;
    if (t === lastT) return;
    lastT = t;
    const ang = t * 0.05;
    wheel.rotation.z = ang;
    for (let k = 0; k < n; k++) {
      const a = ang + (k / n) * Math.PI * 2;
      m.makeTranslation(WHEEL.x + Math.cos(a) * r, WHEEL.axle + Math.sin(a) * r, z);
      cars.setMatrixAt(k, m);
    }
    cars.instanceMatrix.needsUpdate = true;
  };
  cars.onBeforeRender();
}
