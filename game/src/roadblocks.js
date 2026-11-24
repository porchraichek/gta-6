// Roadblocks (3+ stars): two patrol cars (armored vans at 5 stars) parked across the road ahead of a fleeing driver,
// officers behind them, and from 4 stars a spike strip across the gap that blows the tyres.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { N, HALF, PITCH, ROAD } from './config.js';
import { nodeX, nodeZ } from './roadnet.js';
import { rand } from './random.js';

const MAX_BLOCKS = 2;
const INTERVAL = 22; // seconds between roadblocks
const MIN_AHEAD = 110; // never pop one in closer than this
const CAR_OFFSET = 5.5; // lateral offset of each car from the road centre line: leaves a gap in the middle
const STRIP_W = 6.2, STRIP_D = 0.7;

function spikeGeometry() {
  const gb = new GeoBuilder();
  gb.box(0, 0.03, 0, STRIP_W, 0.06, STRIP_D, 0x1d1f22);
  for (let i = 0; i < 16; i++) {
    const x = -STRIP_W / 2 + 0.2 + i * ((STRIP_W - 0.4) / 15);
    gb.box(x, 0.1, -0.15, 0.07, 0.12, 0.07, 0xc9ced6);
    gb.box(x + 0.15, 0.1, 0.15, 0.07, 0.12, 0.07, 0xc9ced6);
  }
  return gb.build();
}

export function createRoadblocks(G, hooks) {
  const RB = { list: [] };
  const stripGeo = spikeGeometry();
  const stripMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
  let cooldown = 6;

  // Find the mid-point of a road segment ahead of the player's car, far enough away to place a block.
  function siteAhead(v) {
    const horiz = Math.abs(v.vx) > Math.abs(v.vz);
    const sign = Math.sign(horiz ? v.vx : v.vz) || 1;
    const along = horiz ? v.x : v.z, across = horiz ? v.z : v.x;
    const line = Math.round((across + HALF) / PITCH);
    const roadC = -HALF + line * PITCH;
    if (Math.abs(across - roadC) > ROAD / 2 + 1) return null; // not on a road running this way
    // segments ahead: between node k and k + sign
    let k = sign > 0 ? Math.floor((along + HALF) / PITCH) : Math.ceil((along + HALF) / PITCH);
    for (let tries = 0; tries < 3; tries++, k += sign) {
      const k2 = k + sign;
      if (k < 0 || k > N || k2 < 0 || k2 > N) return null;
      const mid = -HALF + (k + sign * 0.5) * PITCH;
      if ((mid - along) * sign < MIN_AHEAD) continue;
      return horiz ? { x: mid, z: roadC, horiz, sign } : { x: roadC, z: mid, horiz, sign };
    }
    return null;
  }

  function place(site, level) {
    const type = level.heavy ? 'swat' : 'cruiser';
    const block = { x: site.x, z: site.z, horiz: site.horiz, sign: site.sign, age: 0, units: [], strip: null, spikes: !!level.spikes };
    // across-road heading: a road along x needs cars pointing along z
    const across = site.horiz ? 0 : Math.PI / 2;
    for (const off of [-CAR_OFFSET, CAR_OFFSET]) {
      const x = site.horiz ? site.x : site.x + off, z = site.horiz ? site.z + off : site.z;
      const v = hooks.spawnParked(type, x, z, across + (rand() - 0.5) * 0.5 + (rand() < 0.5 ? Math.PI : 0));
      block.units.push(v);
      // officers take cover behind the cars, away from the approaching suspect
      const bx = x + (site.horiz ? site.sign * 3 : 0), bz = z + (site.horiz ? 0 : site.sign * 3);
      hooks.spawnGuard(bx, bz, level);
    }
    if (block.spikes) {
      const sx = site.x - (site.horiz ? site.sign * 7 : 0), sz = site.z - (site.horiz ? 0 : site.sign * 7);
      const mesh = new THREE.Mesh(stripGeo, stripMat);
      mesh.position.set(sx, 0.04, sz);
      mesh.rotation.y = site.horiz ? Math.PI / 2 : 0;
      mesh.receiveShadow = true;
      G.scene.add(mesh);
      block.strip = { x: sx, z: sz, mesh, hit: new Set() };
    }
    RB.list.push(block);
    G.wanted.radio.say(`Roadblock set ${G.wanted.radio.where(site.x, site.z)}${block.spikes ? ', spikes deployed' : ''}.`, { from: 'unit' });
  }

  function removeBlock(b) {
    if (b.strip) G.scene.remove(b.strip.mesh);
    RB.list.splice(RB.list.indexOf(b), 1);
  }

  function checkSpikes(v) {
    for (const b of RB.list) {
      const s = b.strip;
      if (!s || s.hit.has(v)) continue;
      const da = b.horiz ? v.x - s.x : v.z - s.z; // along the road
      const dc = b.horiz ? v.z - s.z : v.x - s.x; // across the road
      if (Math.abs(da) < STRIP_D / 2 + v.def.length * 0.4 && Math.abs(dc) < STRIP_W / 2 + v.def.width * 0.3) {
        s.hit.add(v);
        if (!v.spiked) {
          v.spiked = true;
          G.vehicles.damage(v, 12, 'police');
          G.audio?.crash(0.5, v.x, v.z);
          G.fx.spark(v.x, 0.3, v.z, 16, 6);
          if (v.driver === 'player') G.hud.notify('Tyres blown! Get it to a respray shop or ditch it.', 'warn');
        }
      }
    }
  }

  // Shredded tyres: capped speed, a wobble and rim sparks until the car is repaired to full health.
  function spikedHandling(v, dt) {
    if (!v.spiked) return;
    if (v.health >= v.maxHealth || v.dead) { v.spiked = false; return; }
    const lim = v.def.maxSpeed * 0.45;
    if (v.speed > lim) { const k = Math.exp(-dt * 1.4); v.vx *= k; v.vz *= k; }
    v.heading += Math.sin(G.time * 9) * dt * 0.22 * Math.min(1, v.speed / 15);
    if (v.speed > 6 && rand() < dt * 12) G.fx.spark(v.x + (rand() - 0.5) * 2, 0.25, v.z + (rand() - 0.5) * 2, 2, 3);
  }

  RB.update = (dt, level) => {
    const P = G.player;
    cooldown -= dt;
    for (let i = RB.list.length - 1; i >= 0; i--) {
      const b = RB.list[i];
      b.age += dt;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if ((b.age > 70 && d > 90) || d > 260 || (!level && d > 60)) removeBlock(b);
    }
    const v = P.mode === 'car' ? P.vehicle : null;
    if (v) {
      checkSpikes(v);
      spikedHandling(v, dt);
    }
    if (!level?.roadblocks || !v || v.speed < 10 || cooldown > 0 || RB.list.length >= MAX_BLOCKS) return;
    cooldown = 4; // retry soon if no site was found
    const site = siteAhead(v);
    if (!site) return;
    if (!hooks.canSpawn(2)) return;
    place(site, level);
    cooldown = INTERVAL;
  };

  RB.reset = () => { while (RB.list.length) removeBlock(RB.list[0]); cooldown = 6; };
  return RB;
}
