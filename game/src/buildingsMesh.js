// Turns generated building records into merged, chunked meshes with facade textures and night-lit windows.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { makeFacadeTextures, makeCurtainTextures } from './textures.js';
import { makeRng } from './random.js';
import { HALF } from './config.js';

const CHUNK = 270;
const TILE_U = 16, TILE_V = 14;

export function createBuildingMaterials() {
  const f = makeFacadeTextures();
  const c = makeCurtainTextures();
  const facade = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.82, metalness: 0.02 });
  const curtain = new THREE.MeshStandardMaterial({ map: c.map, emissiveMap: c.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.3, metalness: 0.15, envMapIntensity: 1.4 });
  const roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  return { facade, curtain, roof };
}

function addBody(wb, rb, b, rng) {
  const base = 0;
  const uOff = rng();
  const opts = { tileU: TILE_U, tileV: TILE_V, noTop: true, uOff };
  let top = 0;
  if (b.podium) {
    const p = b.podium;
    wb.box(b.x, p.h / 2, b.z, p.w, p.h, p.d, p.color, { ...opts });
    rb.box(b.x, p.h, b.z, p.w, 0.05, p.d, 0x8d8a85, { noSides: true });
    top = p.h;
  }
  const mainH = b.roof === 'tiers' ? b.h * (1 - (b.tiers || []).reduce((s, t) => s + t.hf, 0)) : b.h;
  const bodyH = mainH - top;
  const color = b.color;
  const mainBox = { ...opts };
  wb.box(b.x, top + bodyH / 2, b.z, b.w, bodyH, b.d, color, mainBox);
  top += bodyH;
  let w = b.w, d = b.d;
  let roofColor = b.roofColor ?? 0x8e8e94;
  if (b.roof === 'tiers') {
    rb.box(b.x, top, b.z, w, 0.05, d, roofColor, { noSides: true });
    for (const t of b.tiers) {
      w *= t.f; d *= t.f;
      const th = b.h * t.hf;
      wb.box(b.x, top + th / 2, b.z, w, th, d, color, { ...opts, uOff: rng() });
      top += th;
    }
    rb.box(b.x, top, b.z, w, 0.2, d, roofColor, { noSides: true });
    rb.box(b.x, top + 3, b.z, 0.6, 6, 0.6, 0xcccccc);
  } else if (b.roof === 'gable') {
    const rh = Math.min(b.w, b.d) * 0.34;
    roofColor = b.roofColor ?? 0xb4503c;
    if (b.ridgeAlongX) {
      rb.at(b.x, top, b.z, 0);
      rb.prism([[-b.d / 2 - 0.5, 0], [b.d / 2 + 0.5, 0], [0, rh]], b.w + 1, roofColor);
    } else {
      rb.at(b.x, top, b.z, Math.PI / 2);
      rb.prism([[-b.w / 2 - 0.5, 0], [b.w / 2 + 0.5, 0], [0, rh]], b.d + 1, roofColor);
    }
    rb.at(0, 0, 0, 0);
    // gable ends: small triangles are covered by wall extrusions; add chimney
    rb.box(b.x + b.w * 0.25, top + rh * 0.9, b.z, 1.1, 2.4, 1.1, 0x8a6f60);
  } else if (b.roof === 'sawtooth') {
    rb.box(b.x, top, b.z, w, 0.15, d, 0x7a7e84, { noSides: true });
    const n = 4, s = d / n;
    rb.at(b.x, top, b.z, 0);
    for (let k = 0; k < n; k++) {
      rb.prism([[-s / 2 + (k - (n - 1) / 2) * s, 0], [s / 2 + (k - (n - 1) / 2) * s, 0], [s / 2 + (k - (n - 1) / 2) * s, 2.2]], w * 0.98, 0x9aa1a8);
    }
    rb.at(0, 0, 0, 0);
  } else {
    // flat roof with parapet strip and rooftop machinery
    rb.box(b.x, top, b.z, w, 0.12, d, roofColor, { noSides: true });
    const lip = 0.7;
    rb.box(b.x, top + 0.35, b.z - d / 2 + 0.2, w, lip, 0.4, 0xb9b5ad);
    rb.box(b.x, top + 0.35, b.z + d / 2 - 0.2, w, lip, 0.4, 0xb9b5ad);
    rb.box(b.x - w / 2 + 0.2, top + 0.35, b.z, 0.4, lip, d - 0.8, 0xb9b5ad);
    rb.box(b.x + w / 2 - 0.2, top + 0.35, b.z, 0.4, lip, d - 0.8, 0xb9b5ad);
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      rb.box(b.x + (rng() - 0.5) * w * 0.6, top + 1, b.z + (rng() - 0.5) * d * 0.6, 2 + rng() * 3, 1.6, 2 + rng() * 2, 0xc9ccd1);
    }
    if (b.h > 30) rb.box(b.x + w * 0.2, top + 3, b.z, 3, 6, 3, 0xaaaeb4);
  }
  if (b.balcony) {
    for (let y = 3.6; y < b.h - 2; y += 3.5) {
      wb.box(b.x, y, b.z + b.d / 2 + 0.7, b.w * 0.9, 0.18, 1.4, 0xf4f2ee, { noSides: true });
      rb.box(b.x, y + 0.5, b.z + b.d / 2 + 1.35, b.w * 0.9, 0.9, 0.08, 0xe6f1f7);
    }
  }
  return base;
}

export function buildBuildings(scene, city, mats) {
  const chunks = new Map();
  const getChunk = (x, z) => {
    const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
    const k = cx * 10 + cz;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { punched: new GeoBuilder(), glass: new GeoBuilder(), roof: new GeoBuilder() }));
    return c;
  };
  const rng = makeRng(404);
  for (const b of city.buildings) {
    const c = getChunk(b.x, b.z);
    addBody(b.glass ? c.glass : c.punched, c.roof, b, rng);
  }
  const meshes = [];
  const make = (gb, mat) => {
    if (!gb.triCount) return;
    const m = new THREE.Mesh(gb.build(), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    meshes.push(m);
  };
  for (const c of chunks.values()) {
    make(c.punched, mats.facade);
    make(c.glass, mats.curtain);
    make(c.roof, mats.roof);
  }
  return meshes;
}
