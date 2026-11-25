// Builds animated low-poly humanoid models (torso/head, shoulders, swinging arms, thighs with bending shins) and their weapon props.
// Geometry is cached per outfit; civilians draw from a fixed pool of outfits so the cache stays small.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { makeRng } from './random.js';

const geoCache = new Map();
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

export const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68b62, 0x9a6642, 0x6e4529, 0xffdcbf];
export const HAIRS = [0x1b1410, 0x3a2416, 0x6b4a2a, 0xc9a24a, 0x8a2b1f, 0x2a2a2e, 0xdddddd];
export const SHIRTS = [0xe63946, 0xf4a261, 0xffd166, 0x2a9d8f, 0x3a86ff, 0xf1faee, 0xff6fb5, 0x8338ec, 0x06d6a0, 0xffffff, 0xff9f1c, 0x00b4d8];
export const PANTS = [0x1d3557, 0x2b2d42, 0x3d405b, 0xd8c3a5, 0x264653, 0x6c757d, 0xe9edc9, 0x22223b];
const HAT_COLORS = [0xf4f1de, 0x1d3557, 0xe63946, 0xd8c3a5, 0x2b2d42, 0x3a86ff];
const JACKETS = [0x2b2d42, 0x6b4a2a, 0x3d405b, 0x7a1f2b, 0x264653];

function cached(key, build) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = build()));
  return g;
}

// Hair and headwear on top of the head box (head centre y=1.72, half size ~0.125).
function addHead(b, o, style) {
  const hair = o.hair;
  if (style === 'cop') {
    b.box(0, 1.88, 0, 0.27, 0.09, 0.27, 0x16213a);
    b.box(0, 1.85, 0.16, 0.25, 0.03, 0.12, 0x101828);
    return;
  }
  if (style === 'swat') {
    b.box(0, 1.8, 0, 0.29, 0.32, 0.29, 0x20242b);
    b.box(0, 1.75, 0.145, 0.22, 0.07, 0.02, 0x0a0a0a);
    return;
  }
  const hs = o.hairStyle || 'short';
  if (hs !== 'bald') b.box(0, 1.87, -0.01, 0.255, 0.07, 0.26, hair);
  if (hs === 'short' || hs === 'long' || hs === 'bun') b.box(0, 1.77, -0.12, 0.255, 0.18, 0.04, hair);
  if (hs === 'long') { b.box(0, 1.62, -0.13, 0.25, 0.22, 0.05, hair); b.box(0.125, 1.72, -0.04, 0.02, 0.2, 0.16, hair); b.box(-0.125, 1.72, -0.04, 0.02, 0.2, 0.16, hair); }
  if (hs === 'bun') b.box(0, 1.9, -0.12, 0.11, 0.1, 0.1, hair);
  if (hs === 'mohawk') b.box(0, 1.93, 0, 0.06, 0.08, 0.26, hair);
  const hc = o.hatColor ?? 0x222222;
  if (o.hat === 'cap') { b.box(0, 1.89, 0, 0.27, 0.08, 0.27, hc); b.box(0, 1.86, 0.17, 0.24, 0.025, 0.14, hc); }
  else if (o.hat === 'beanie') b.box(0, 1.9, 0, 0.27, 0.1, 0.27, hc);
  else if (o.hat === 'sunhat') { b.box(0, 1.87, 0, 0.46, 0.02, 0.46, hc); b.box(0, 1.92, 0, 0.26, 0.09, 0.26, hc); }
  else if (o.hat === 'fedora') { b.box(0, 1.86, 0, 0.38, 0.02, 0.38, hc); b.box(0, 1.92, 0, 0.25, 0.11, 0.25, hc); b.box(0, 1.88, 0, 0.26, 0.025, 0.26, 0x111111); }
  else if (o.hat === 'bandana') b.box(0, 1.85, 0, 0.27, 0.07, 0.27, hc);
}

// outfit: {skin, hair, shirt, pants, shoes, style: 'civ'|'cop'|'swat'|'thug'|'hero'|'bikini',
//          hairStyle?, hat?, hatColor?, top?: 'tee'|'tank'|'jacket', jacket?, legs?: 'pants'|'shorts'}
export function buildHumanoid(o) {
  const key = JSON.stringify(o);
  const style = o.style || 'civ';
  const skin = o.skin, shirt = o.shirt, pants = o.pants;
  const top = o.top || (style === 'bikini' ? 'tank' : style === 'hero' || style === 'cop' || style === 'swat' ? 'jacket' : 'tee');
  const sleeve = top === 'jacket' ? (o.jacket ?? (style === 'hero' ? 0x232830 : shirt)) : shirt;
  const shorts = o.legs === 'shorts' || style === 'bikini';

  const torsoGeo = cached('t' + key, () => {
    const b = new GeoBuilder();
    b.box(0, 0.99, 0, 0.36, 0.2, 0.23, pants); // hips
    b.box(0, 1.17, 0, 0.37, 0.2, 0.22, shirt); // waist
    b.box(0, 1.37, 0, 0.46, 0.26, 0.26, top === 'jacket' ? sleeve : shirt); // chest
    if (top === 'jacket') b.box(0, 1.3, 0.125, 0.12, 0.34, 0.02, shirt); // open jacket shows the shirt
    if (top === 'tank') b.box(0, 1.47, 0, 0.5, 0.06, 0.2, skin); // bare shoulders
    else b.box(0, 1.48, 0, 0.52, 0.08, 0.25, sleeve); // shoulders
    b.box(0, 1.56, 0, 0.12, 0.08, 0.12, skin); // neck
    b.box(0, 1.72, 0, 0.23, 0.26, 0.24, skin); // head
    b.box(0.055, 1.74, 0.121, 0.04, 0.03, 0.01, 0x1a1a1a); // eyes
    b.box(-0.055, 1.74, 0.121, 0.04, 0.03, 0.01, 0x1a1a1a);
    b.box(0, 1.69, 0.13, 0.04, 0.05, 0.03, skin); // nose
    if (style === 'cop') {
      b.box(0.1, 1.38, 0.135, 0.06, 0.06, 0.02, 0xf2c94c); // badge
      b.box(0, 1.08, 0, 0.39, 0.06, 0.25, 0x1b1b1b); // belt
    } else if (style === 'swat') {
      b.box(0, 1.3, 0.01, 0.5, 0.42, 0.31, 0x2a3038); // vest
    } else if (style === 'thug') {
      b.box(0, 1.28, 0, 0.48, 0.42, 0.28, o.jacket ?? 0x2c2c32); // vest
    } else if (style === 'bikini') {
      b.box(0, 1.17, 0, 0.375, 0.2, 0.225, skin);
    }
    addHead(b, o, style);
    return b.build();
  });
  const armGeo = cached('a' + key, () => {
    const b = new GeoBuilder();
    if (top === 'tank') b.box(0, -0.15, 0, 0.11, 0.3, 0.12, skin);
    else if (top === 'jacket') b.box(0, -0.15, 0, 0.125, 0.3, 0.13, sleeve);
    else { b.box(0, -0.09, 0, 0.125, 0.18, 0.13, sleeve); b.box(0, -0.24, 0, 0.105, 0.14, 0.11, skin); }
    b.box(0, -0.43, 0, 0.1, 0.26, 0.11, top === 'jacket' ? sleeve : skin); // forearm
    b.box(0, -0.6, 0.01, 0.09, 0.1, 0.1, skin); // hand
    return b.build();
  });
  const thighGeo = cached('h' + key, () => {
    const b = new GeoBuilder();
    b.box(0, -0.23, 0, 0.18, 0.48, 0.2, pants);
    return b.build();
  });
  const shinGeo = cached('s' + key, () => {
    const b = new GeoBuilder();
    b.box(0, -0.2, 0, 0.16, 0.42, 0.18, shorts ? skin : pants);
    b.box(0, -0.44, 0.04, 0.17, 0.09, 0.28, o.shoes ?? 0x202020);
    return b.build();
  });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.castShadow = true;
  const pivot = (geo, x, y, parent) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    p.add(m);
    parent.add(p);
    return p;
  };
  const armL = pivot(armGeo, 0.31, 1.47, group);
  const armR = pivot(armGeo, -0.31, 1.47, group);
  const legL = pivot(thighGeo, 0.1, 0.94, group);
  const legR = pivot(thighGeo, -0.1, 0.94, group);
  const shinL = pivot(shinGeo, 0, -0.46, legL);
  const shinR = pivot(shinGeo, 0, -0.46, legR);
  group.add(torso);

  const gun = new THREE.Mesh(gunGeometry('pistol'), mat);
  gun.position.set(0, -0.6, 0.02);
  gun.rotation.x = Math.PI / 2;
  gun.visible = false;
  gun.castShadow = true;
  armR.add(gun);
  const meshes = [];
  group.traverse((n) => n.isMesh && meshes.push(n));
  return { group, torso, armL, armR, legL, legR, shinL, shinR, gun, meshes, shadows: true };
}

const gunGeos = new Map();
// Prop held in the right hand. Local +z points out of the fist (along the barrel), +y is the top of the gun.
export function gunGeometry(id) {
  let g = gunGeos.get(id);
  if (g) return g;
  const b = new GeoBuilder();
  if (id === 'pistol') {
    b.box(0, 0.02, 0.1, 0.06, 0.09, 0.3, 0x222428);
    b.box(0, -0.07, 0.0, 0.05, 0.14, 0.08, 0x2f2f33);
  } else if (id === 'smg') {
    b.box(0, 0.02, 0.16, 0.07, 0.1, 0.46, 0x25272b);
    b.box(0, -0.09, 0.08, 0.05, 0.2, 0.07, 0x1a1a1a);
    b.box(0, 0.05, -0.12, 0.05, 0.06, 0.2, 0x30343a);
  } else if (id === 'rifle') {
    b.box(0, 0.02, 0.22, 0.07, 0.11, 0.62, 0x2b2f2a);
    b.box(0, 0.02, 0.62, 0.03, 0.03, 0.22, 0x1a1a1a);
    b.box(0, -0.11, 0.18, 0.06, 0.2, 0.08, 0x1a1a1a); // magazine
    b.box(0, -0.02, -0.2, 0.06, 0.12, 0.26, 0x3c4236); // stock
    b.box(0, 0.1, 0.2, 0.04, 0.04, 0.16, 0x111111); // sight
  } else if (id === 'marksman') {
    b.box(0, 0.02, 0.28, 0.07, 0.1, 0.8, 0x4a3a28);
    b.box(0, 0.03, 0.8, 0.03, 0.03, 0.3, 0x1a1a1a);
    b.box(0, 0.12, 0.24, 0.05, 0.05, 0.3, 0x15171a); // scope
    b.box(0, -0.04, -0.2, 0.07, 0.14, 0.26, 0x4a3a28);
  } else if (id === 'shotgun') {
    b.box(0, 0, 0.3, 0.08, 0.09, 0.7, 0x3a2a1d);
    b.box(0, 0.03, 0.46, 0.05, 0.05, 0.4, 0x2a2c30);
    b.box(0, -0.03, -0.1, 0.07, 0.12, 0.2, 0x3a2a1d);
  } else if (id === 'bat') {
    b.box(0, 0, 0.12, 0.05, 0.05, 0.3, 0x2a1a10); // grip
    b.box(0, 0, 0.48, 0.08, 0.08, 0.46, 0xb98a55);
    b.box(0, 0, 0.74, 0.09, 0.09, 0.08, 0xa77a48);
  } else if (id === 'grenade') {
    b.box(0, 0, 0.05, 0.11, 0.13, 0.11, 0x4b5a32);
    b.box(0, 0.08, 0.05, 0.04, 0.04, 0.04, 0x9a9a9a);
  } else if (id === 'firebomb') {
    b.box(0, 0, 0.06, 0.09, 0.09, 0.2, 0x3f7a3a);
    b.box(0, 0, 0.2, 0.04, 0.04, 0.1, 0x3f7a3a);
    b.box(0, 0, 0.27, 0.035, 0.035, 0.06, 0xf4e1b0); // rag
  } else {
    b.box(0, 0, 0.1, 0.06, 0.08, 0.2, 0x333333);
  }
  g = b.build();
  gunGeos.set(id, g);
  return g;
}
// Distance from the hand to the muzzle along +z for each prop.
export const MUZZLE_LENGTH = { pistol: 0.27, smg: 0.4, rifle: 0.74, marksman: 0.96, shotgun: 0.66 };

// A fixed pool of varied civilian looks (clothes, hair styles, hats) so geometry is shared between pedestrians.
const CIV_POOL = (() => {
  const r = makeRng(7331);
  const out = [];
  for (let i = 0; i < 56; i++) {
    const top = r.pick(['tee', 'tee', 'tee', 'tank', 'jacket']);
    out.push({
      style: 'civ', skin: r.pick(SKINS), hair: r.pick(HAIRS), shirt: r.pick(SHIRTS), pants: r.pick(PANTS),
      shoes: r.pick([0x202020, 0xf0f0f0, 0x6b4a2a, 0xe63946]), hairStyle: r.pick(['short', 'short', 'long', 'bun', 'bald', 'mohawk']),
      hat: r.chance(0.35) ? r.pick(['cap', 'sunhat', 'fedora', 'beanie']) : null, hatColor: r.pick(HAT_COLORS),
      top, jacket: r.pick(JACKETS), legs: r.chance(0.35) ? 'shorts' : 'pants',
    });
  }
  return out;
})();

export function randomCivilianOutfit(rng) {
  return CIV_POOL[Math.floor(rng() * CIV_POOL.length)];
}
