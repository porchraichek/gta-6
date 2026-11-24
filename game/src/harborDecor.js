// Port Marrow dressing: ship-to-shore cranes on the south quay, yard gantry cranes, bollards, and a moored
// container ship. All merged into one mesh (plus beacon glows).
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { addGlow } from './glowSprites.js';
import { HALF, ISLAND } from './config.js';
import { makeRng } from './random.js';

export const QUAY = { x0: -ISLAND, x1: 330, z: ISLAND }; // concrete apron replaces the sand along the port

const CONTAINER = [0xd64545, 0x2d6fbd, 0xe9a23b, 0x3a9d6e, 0x8a5fb8, 0xe8e2d0, 0x1f7a8c];

// Ship-to-shore crane: two A-frame legs straddling the quay, a long boom reaching out over the water.
function stsCrane(g, x, z) {
  const col = 0xe0533a, white = 0xf0f0f0;
  const legH = 26, span = 16, gauge = 12;
  for (const sx of [-gauge / 2, gauge / 2]) {
    for (const sz of [-span / 2, span / 2]) g.box(x + sx, legH / 2, z + sz, 1.2, legH, 1.2, col);
    g.box(x + sx, legH, z, 1.4, 1.6, span + 1.2, col);
    g.beam([x + sx, 2, z - span / 2], [x + sx, legH - 2, z + span / 2], 0.6, col);
    g.box(x + sx, 0.6, z, 1.6, 1.2, span + 2, 0x3a3f46);
  }
  for (const sz of [-span / 2, span / 2]) g.box(x, legH - 4, z + sz, gauge, 1, 1, col);
  // boom: back to the land, long reach over the sea (+z)
  g.box(x, legH + 3, z + 14, 4, 1.6, 66, white);
  g.box(x, legH + 1.1, z - 12, 6, 3.4, 9, col); // machinery house
  g.box(x, legH + 1, z + 2, 3.2, 2.4, 3.2, 0xd9dde0); // operator cab
  g.box(x, legH + 13, z - 2, 1, 22, 1, col); // apex tower
  g.beam([x, legH + 23.5, z - 2], [x, legH + 3.8, z + 40], 0.35, col); // stays
  g.beam([x, legH + 23.5, z - 2], [x, legH + 3.8, z - 16], 0.35, col);
  g.box(x, legH - 1, z + 30, 3, 1.8, 3, 0x3a3f46); // trolley + spreader
  g.cylinder(x, legH - 6, z + 30, 0.05, 8, 0x222222, 'y', 3);
  g.box(x, legH - 10.4, z + 30, 3, 0.8, 12.4, 0xf2c230);
  addGlow(x, legH + 24.3, z - 2, 4, 0xff3030, 'blink');
  addGlow(x, legH + 4, z + 46.5, 3, 0xff3030, 'blink');
}

// Yard gantry crane over a container row.
function yardGantry(g, x, z) {
  const col = 0xf2c230;
  for (const sx of [-11, 11]) {
    for (const sz of [-3, 3]) g.box(x + sx, 8, z + sz, 0.8, 16, 0.8, col);
    g.box(x + sx, 0.5, z, 1, 1, 8, 0x3a3f46);
  }
  g.box(x, 16.3, z - 3, 23, 1, 1, col);
  g.box(x, 16.3, z + 3, 23, 1, 1, col);
  g.box(x + 3, 15.6, z, 3, 2, 7, 0xd9dde0);
  addGlow(x, 17.2, z, 3, 0xffb020, 'blink');
}

function ship(g, x, z, rng) {
  const L = 150, B = 24, hullH = 11;
  g.at(x, 0, z, Math.PI / 2); // ship long axis along world x
  const hull = 0x1d3557, red = 0xb23a3a;
  // hull profile across the beam (local z), extruded along the length (local x)
  g.prism([[-B / 2, hullH], [B / 2, hullH], [B / 2 - 1.5, -2], [-B / 2 + 1.5, -2]], L, hull, 0, 0, 0, { edgeColors: [0xdedede, hull, red, hull] });
  // bow wedge
  g.prism([[-B / 2, hullH], [B / 2, hullH], [0, -2]], 0.01, hull, L / 2, 0, 0);
  g.at(0, 0, 0, 0);
  // bow taper built in world space as a pyramid-ish prism
  const bow = new GeoBuilder();
  void bow;
  g.at(x, 0, z, 0);
  g.prism([[-B / 2, -2], [-B / 2, hullH], [-B / 2 - 16, hullH + 1.5]], B, hull, 0, 0, 0);
  g.box(0, hullH + 0.05, 0, B, 0.1, L, 0x7a2e2e, { noSides: true });
  // container bays on deck
  for (let bz = -L / 2 + 30; bz < L / 2 - 8; bz += 6.6) {
    const rows = 7, tiers = 2 + Math.floor(rng() * 4);
    for (let r = 0; r < rows; r++) {
      const h = Math.max(1, tiers - (r === 0 || r === rows - 1 ? 1 : 0));
      for (let t = 0; t < h; t++) g.box(-B / 2 + 2.2 + r * 2.95, hullH + 1.3 + t * 2.6, bz, 2.45, 2.5, 6.1, CONTAINER[Math.floor(rng() * CONTAINER.length)]);
    }
  }
  // superstructure at the stern
  g.box(0, hullH + 7, -L / 2 + 13, B - 4, 14, 10, 0xf4f4f0);
  for (let k = 0; k < 4; k++) g.box(0, hullH + 3 + k * 3.2, -L / 2 + 18.05, B - 5, 1.2, 0.1, 0x2a3a4a);
  g.box(0, hullH + 14.5, -L / 2 + 14, B + 4, 1, 6, 0xf4f4f0);
  g.box(0, hullH + 18, -L / 2 + 7, 3.5, 7, 4.5, red);
  g.box(0, hullH + 21.8, -L / 2 + 7, 3.6, 0.8, 4.6, 0x111111);
  g.at(0, 0, 0, 0);
  addGlow(x - L / 2 + 13, hullH + 16, z, 3, 0xffffff, 'night', 0.8);
  addGlow(x + L / 2 + 14, hullH + 3, z, 3, 0x30ff70, 'night', 0.7);
}

export function buildHarbor(scene, city, mat) {
  const rng = makeRng(909);
  const g = new GeoBuilder();
  const qz = QUAY.z - 3;
  // quay edge: fenders and bollards
  for (let x = QUAY.x0 + 10; x < QUAY.x1; x += 12) {
    g.cylinder(x, 0.45, qz + 2.2, 0.35, 0.9, 0x2b2d33, 'y', 8);
    g.box(x + 6, -0.6, QUAY.z + 0.25, 1.6, 2.2, 0.5, 0x1c1c1c);
  }
  for (const x of [-330, -230, -130]) stsCrane(g, x, qz - 10);
  for (const p of city.props) if (p.crane) yardGantry(g, p.x - 24, p.z - 12);
  ship(g, -200, QUAY.z + 15, rng);
  const m = new THREE.Mesh(g.build(), mat);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  void HALF;
}
