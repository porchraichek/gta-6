// Police helicopter (3+ stars): orbits the suspect or sweeps the search area with a visible searchlight cone,
// spots the player caught in the beam, and carries a door gunner.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { rand, damp } from './random.js';

const BEAM_RADIUS = 6; // radius of the lit circle on the ground
const ORBIT_RADIUS = 26, ORBIT_ALT = 34, SEARCH_ALT = 42;
const GUN_RANGE = 75;
const MAX_SPEED = 30; // m/s
const TRACK_RANGE = 70; // while in pursuit the crew keeps the suspect in view this far out

function buildModel() {
  const gb = new GeoBuilder();
  gb.box(0, 0, 0, 2.2, 2.0, 5.4, 0x1b2d52);
  gb.box(0, 0.1, 3.9, 0.5, 0.6, 3.2, 0x1b2d52);
  gb.box(0, 0.6, 5.4, 0.1, 1.4, 0.7, 0x1b2d52);
  gb.box(0, -1.15, 0, 2.6, 0.12, 4.2, 0x222222);
  gb.box(0, 0.7, -1.9, 1.8, 0.8, 0.3, 0x7ab6e8);
  gb.box(0, -0.2, 0, 2.25, 0.35, 5.45, 0xf1faee); // white livery stripe
  const body = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 }));
  body.castShadow = true;
  const rg = new GeoBuilder();
  rg.box(0, 0, 0, 12, 0.06, 0.35, 0x333333);
  rg.box(0, 0, 0, 0.35, 0.06, 12, 0x333333);
  const rotor = new THREE.Mesh(rg.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  rotor.position.y = 1.35;
  const navMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  const nav = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), navMat);
  nav.position.set(0, 1.4, 5.5);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false }));
  lamp.position.set(0, -1.25, -1.6);
  const group = new THREE.Group();
  group.add(body, rotor, nav, lamp);
  return { group, rotor, nav };
}

function buildBeam() {
  const additive = (opacity) => new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // unit cone: apex at the origin, base (radius 1) one unit down -y
  const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  coneGeo.translate(0, -0.5, 0);
  const cone = new THREE.Mesh(coneGeo, additive(0.1));
  cone.frustumCulled = false;
  cone.renderOrder = 3;
  const diskGeo = new THREE.CircleGeometry(1, 28);
  diskGeo.rotateX(-Math.PI / 2);
  const disk = new THREE.Mesh(diskGeo, additive(0.4));
  disk.renderOrder = 3;
  return { cone, disk };
}

export function createPoliceHelicopter(G) {
  const H = { active: false, x: 0, y: 60, z: 0, beamX: 0, beamZ: 0, leaving: 0 };
  const m = buildModel();
  const beam = buildBeam();
  H.beam = beam;
  const spot = new THREE.SpotLight(0xfff2d0, 0, 160, 0.2, 0.45, 1.2);
  // everything lives in the scene from the start (hidden) so the first appearance causes no shader recompile
  G.scene.add(m.group, beam.cone, beam.disk, spot, spot.target);
  m.group.visible = beam.cone.visible = beam.disk.visible = false;
  let ang = 0, shootT = 1.5, spotT = 0, sweepT = 0;
  const down = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3(), lampPos = new THREE.Vector3();

  function show(on) {
    m.group.visible = beam.cone.visible = beam.disk.visible = on;
    if (!on) spot.intensity = 0;
  }

  // Can the crew see (x, z)? Tracking a known suspect works out to TRACK_RANGE; while searching they need the
  // point inside the lit beam at night, or plainly in view by day.
  H.sees = (x, z) => {
    if (!H.active || H.leaving > 0) return false;
    const d = Math.hypot(x - H.x, z - H.z);
    const tracking = !G.wanted.search.active && d < TRACK_RANGE;
    const inBeam = Math.hypot(x - H.beamX, z - H.beamZ) < BEAM_RADIUS + 1.5;
    const dayView = G.env.night < 0.5 && d < 55;
    if (!tracking && !inBeam && !dayView) return false;
    return G.collision.lineOfSight(H.x, H.y - 1.5, H.z, x, 1.2, z);
  };

  function gunner(dt, stars) {
    const P = G.player;
    shootT -= dt;
    if (shootT > 0) return;
    shootT = stars >= 5 ? 0.45 : stars >= 4 ? 0.7 : 1.1;
    if (Math.hypot(P.x - H.x, P.z - H.z, P.y - H.y) > GUN_RANGE || !G.collision.lineOfSight(H.x, H.y - 1.5, H.z, P.x, P.y + 1, P.z)) return;
    const hit = rand() < 0.18 + stars * 0.05;
    const spread = hit ? 0.4 : 3;
    G.fx.tracer(H.x, H.y - 1.2, H.z, P.x + (rand() - 0.5) * spread, P.y + 1, P.z + (rand() - 0.5) * spread);
    G.audio?.gunshot('smg', H.x, H.z);
    if (!hit) return;
    if (P.mode === 'car') { G.vehicles.damage(P.vehicle, 4, 'police'); P.takeDamage(1.5, 'police'); }
    else P.takeDamage(5, 'police');
  }

  H.update = (dt, level) => {
    const P = G.player, W = G.wanted;
    const wanted = !!level?.heli;
    if (!wanted && !H.active) return;
    if (wanted && !H.active) {
      // arrive from a distance, high up
      const a = rand() * Math.PI * 2;
      H.x = P.x + Math.cos(a) * 170; H.z = P.z + Math.sin(a) * 170; H.y = 70;
      H.beamX = P.x; H.beamZ = P.z;
      H.active = true; H.leaving = 0;
      show(true);
    }
    if (!wanted && H.leaving <= 0) H.leaving = 6;
    const search = W.search;
    let tx, tz, ty, bx, bz;
    if (H.leaving > 0) {
      H.leaving -= dt;
      tx = H.x + (H.x - P.x) * 0.5; tz = H.z + (H.z - P.z) * 0.5; ty = 90;
      bx = H.beamX; bz = H.beamZ;
      if (H.leaving <= 0) { H.active = false; show(false); return; }
    } else if (search.active) {
      ang += dt * 0.25;
      const r = search.radius * 0.5;
      tx = search.x + Math.cos(ang) * r; tz = search.z + Math.sin(ang) * r; ty = SEARCH_ALT;
      // sweep a figure across the area
      sweepT += dt;
      bx = search.x + Math.sin(sweepT * 0.37) * search.radius * 0.8;
      bz = search.z + Math.sin(sweepT * 0.53 + 1) * search.radius * 0.8;
    } else {
      ang += dt * 0.35;
      tx = P.x + Math.cos(ang) * ORBIT_RADIUS; tz = P.z + Math.sin(ang) * ORBIT_RADIUS; ty = ORBIT_ALT;
      const pv = P.mode === 'car' ? P.vehicle : P.actor;
      bx = P.x + pv.vx * 0.25; bz = P.z + pv.vz * 0.25;
    }
    // capped air speed: a fast car can outrun it
    const dx = tx - H.x, dz = tz - H.z, d = Math.hypot(dx, dz);
    const step = Math.min(d, Math.min(d * 0.9, MAX_SPEED) * dt);
    if (d > 0.01) { H.x += (dx / d) * step; H.z += (dz / d) * step; }
    H.y = damp(H.y, ty, 0.8, dt);
    H.beamX = damp(H.beamX, bx, search.active ? 1.6 : 4, dt);
    H.beamZ = damp(H.beamZ, bz, search.active ? 1.6 : 4, dt);

    // pose: nose towards the beam, tilt forward
    const yaw = Math.atan2(H.beamX - H.x, H.beamZ - H.z);
    m.group.position.set(H.x, H.y, H.z);
    m.group.rotation.set(0.12, yaw + Math.PI, 0, 'YXZ');
    m.rotor.rotation.y += dt * 30;
    m.nav.visible = Math.floor(G.time * 1.5) % 2 === 0;

    // searchlight: cone from the lamp down to the ground circle, brighter at night
    const night = G.env.night;
    lampPos.set(H.x, H.y - 1.3, H.z);
    dir.set(H.beamX - lampPos.x, 0.05 - lampPos.y, H.beamZ - lampPos.z);
    const len = dir.length();
    dir.divideScalar(len);
    beam.cone.position.copy(lampPos);
    beam.cone.quaternion.setFromUnitVectors(down, dir);
    beam.cone.scale.set(BEAM_RADIUS, len, BEAM_RADIUS);
    beam.cone.material.opacity = 0.015 + 0.11 * night;
    beam.disk.position.set(H.beamX, 0.25, H.beamZ);
    beam.disk.scale.setScalar(BEAM_RADIUS);
    beam.disk.material.opacity = 0.05 + 0.4 * night;
    spot.position.copy(lampPos);
    spot.target.position.set(H.beamX, 0, H.beamZ);
    spot.angle = Math.atan(BEAM_RADIUS / len) * 1.15;
    spot.intensity = 1600 * (0.1 + night);

    if (H.leaving > 0) return;
    spotT -= dt;
    if (spotT <= 0) {
      spotT = 0.3;
      if (H.sees(P.x, P.z)) W.spot();
    }
    if (level.heliGunner && !search.active) gunner(dt, W.stars);
  };

  H.reset = () => { H.active = false; H.leaving = 0; show(false); };
  return H;
}
