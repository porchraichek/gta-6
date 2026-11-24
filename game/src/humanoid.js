// Builds animated low-poly humanoid models (torso/head, swinging arms and legs) and their gun props.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';

const geoCache = new Map();
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

export const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68b62, 0x9a6642, 0x6e4529, 0xffdcbf];
export const HAIRS = [0x1b1410, 0x3a2416, 0x6b4a2a, 0xc9a24a, 0x8a2b1f, 0x2a2a2e, 0xdddddd];
export const SHIRTS = [0xe63946, 0xf4a261, 0xffd166, 0x2a9d8f, 0x3a86ff, 0xf1faee, 0xff6fb5, 0x8338ec, 0x06d6a0, 0xffffff, 0xff9f1c, 0x00b4d8];
export const PANTS = [0x1d3557, 0x2b2d42, 0x3d405b, 0xd8c3a5, 0x264653, 0x6c757d, 0xe9edc9, 0x22223b];

function cached(key, build) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = build()));
  return g;
}

// outfit: {skin, hair, shirt, pants, shoes, style: 'civ'|'cop'|'swat'|'thug'|'hero'|'bikini'}
export function buildHumanoid(o) {
  const key = JSON.stringify(o);
  const style = o.style || 'civ';
  const skin = o.skin, shirt = o.shirt, pants = o.pants;

  const torsoGeo = cached('t' + key, () => {
    const b = new GeoBuilder();
    b.box(0, 1.2, 0, 0.46, 0.62, 0.26, shirt);
    b.box(0, 1.62, 0, 0.16, 0.08, 0.16, skin); // neck
    b.box(0, 1.76, 0, 0.24, 0.26, 0.24, skin); // head
    // hair / headwear
    if (style === 'cop') {
      b.box(0, 1.92, 0, 0.27, 0.1, 0.27, 0x16213a);
      b.box(0, 1.89, 0.15, 0.27, 0.03, 0.12, 0x16213a);
      b.box(0.1, 1.28, 0.14, 0.08, 0.08, 0.02, 0xf2c94c); // badge
      b.box(0, 0.95, 0, 0.48, 0.1, 0.28, 0x1b1b1b); // belt
    } else if (style === 'swat') {
      b.box(0, 1.84, 0, 0.29, 0.34, 0.29, 0x20242b);
      b.box(0, 1.8, 0.145, 0.2, 0.06, 0.02, 0x0a0a0a);
      b.box(0, 1.28, 0.02, 0.5, 0.42, 0.3, 0x2a3038);
    } else if (style === 'hero') {
      b.box(0, 1.94, -0.02, 0.26, 0.1, 0.28, o.hair);
      b.box(0, 1.84, -0.1, 0.26, 0.2, 0.1, o.hair);
      b.box(0, 1.38, 0.0, 0.48, 0.2, 0.28, 0x232830); // jacket yoke
    } else if (style === 'thug') {
      b.box(0, 1.93, 0, 0.27, 0.08, 0.27, 0x111111); // beanie
      b.box(0, 1.28, 0, 0.5, 0.44, 0.3, 0x2c2c32);
    } else {
      b.box(0, 1.93, 0, 0.26, 0.09, 0.26, o.hair);
      b.box(0, 1.83, -0.11, 0.26, 0.2, 0.06, o.hair);
    }
    return b.build();
  });
  const armGeo = (sleeve) =>
    cached('a' + key + sleeve, () => {
      const b = new GeoBuilder();
      b.box(0, -0.2, 0, 0.12, 0.42, 0.13, shirt);
      b.box(0, -0.5, 0, 0.1, 0.2, 0.11, skin);
      return b.build();
    });
  const legGeo = cached('l' + key, () => {
    const b = new GeoBuilder();
    b.box(0, -0.4, 0, 0.19, 0.8, 0.2, pants);
    b.box(0, -0.85, 0.04, 0.2, 0.1, 0.28, o.shoes ?? 0x202020);
    return b.build();
  });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.castShadow = true;
  const mk = (geo, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    pivot.add(m);
    return pivot;
  };
  const armL = mk(armGeo('l'), 0.3, 1.46);
  const armR = mk(armGeo('r'), -0.3, 1.46);
  const legL = mk(legGeo, 0.11, 0.9);
  const legR = mk(legGeo, -0.11, 0.9);
  group.add(torso, armL, armR, legL, legR);

  const gun = new THREE.Mesh(gunGeometry('pistol'), mat);
  gun.position.set(0, -0.5, 0);
  gun.rotation.x = Math.PI / 2;
  gun.visible = false;
  armR.add(gun);
  return { group, torso, armL, armR, legL, legR, gun };
}

const gunGeos = new Map();
export function gunGeometry(id) {
  let g = gunGeos.get(id);
  if (g) return g;
  const b = new GeoBuilder();
  if (id === 'pistol') {
    b.box(0, 0, 0.14, 0.06, 0.09, 0.3, 0x222428);
    b.box(0, -0.08, 0.04, 0.05, 0.14, 0.08, 0x2f2f33);
  } else if (id === 'smg') {
    b.box(0, 0, 0.2, 0.07, 0.1, 0.46, 0x25272b);
    b.box(0, -0.11, 0.12, 0.05, 0.2, 0.07, 0x1a1a1a);
    b.box(0, 0.03, -0.1, 0.05, 0.06, 0.2, 0x30343a);
  } else {
    b.box(0, 0, 0.3, 0.08, 0.09, 0.7, 0x3a2a1d);
    b.box(0, 0.03, 0.46, 0.05, 0.05, 0.4, 0x2a2c30);
    b.box(0, -0.03, -0.1, 0.07, 0.12, 0.2, 0x3a2a1d);
  }
  g = b.build();
  gunGeos.set(id, g);
  return g;
}

export function randomCivilianOutfit(rng) {
  return { style: 'civ', skin: rng.pick(SKINS), hair: rng.pick(HAIRS), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), shoes: rng.pick([0x202020, 0xf0f0f0, 0x6b4a2a]) };
}
