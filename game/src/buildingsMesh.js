// Turns generated building records into merged, chunked meshes: atlas facades with per-window night lighting,
// rooftop features (helipads, spires, tanks), art-deco neon trim, shopfronts, blade signs and billboards.
import * as THREE from 'three';
import { ChunkedGeo, GeoBuilder } from './geomkit.js';
import { makeFacadeAtlas, makeCurtainAtlas } from './facadeTextures.js';
import { makeShopfrontAtlas, makeBillboardAtlas, makeHotelSignAtlas, SHOPS } from './signTextures.js';
import { nightGlow } from './worldUniforms.js';
import { addGlow } from './glowSprites.js';
import { makeRng } from './random.js';
import { HALF } from './config.js';

const CHUNK = 270;
const FLOOR = 3.5; // facade tile is 4 floors (14 m) tall
const SHOP_W = 7, SHOP_H = 3.4;

// Facade shader patch: sample a 2x2 style atlas cell chosen per vertex (tag.xy) and light windows per cell
// of the window grid with a per-building seed (tag.z) so every building has its own lit pattern and tints.
function atlasFacade(material, winGrid, litFraction, key) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uWinGrid = { value: new THREE.Vector2(winGrid, winGrid) };
    sh.uniforms.uLit = { value: litFraction };
    sh.vertexShader = 'attribute vec3 tag;\nvarying vec3 vTag;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vTag = tag;');
    sh.fragmentShader = 'varying vec3 vTag;\nuniform vec2 uWinGrid;\nuniform float uLit;\nfloat winHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 cellUv = (fract(vMapUv) * 0.994 + 0.003 + vTag.xy) * 0.5;
        vec2 gdx = dFdx(vMapUv) * 0.5, gdy = dFdy(vMapUv) * 0.5;
        diffuseColor *= textureGrad(map, cellUv, gdx, gdy);`)
      .replace('#include <emissivemap_fragment>', `
        {
          vec4 winMask = textureGrad(emissiveMap, cellUv, gdx, gdy);
          vec2 win = floor(vMapUv * uWinGrid);
          float hA = winHash(win + vTag.z * 13.7);
          float hB = winHash(win * 1.71 + vTag.z * 3.3 + 7.0);
          vec3 tint = hA < 0.42 ? vec3(1.0, 0.7, 0.4) : hA < 0.68 ? vec3(1.0, 0.86, 0.62) : hA < 0.88 ? vec3(0.62, 0.8, 1.0) : hA < 0.95 ? vec3(0.5, 0.55, 1.0) : vec3(1.0, 0.45, 0.75);
          float on = step(hB, uLit) * (0.5 + 0.7 * fract(hA * 7.31));
          totalEmissiveRadiance *= winMask.rgb * tint * on;
        }`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export function createBuildingMaterials() {
  const f = makeFacadeAtlas();
  const c = makeCurtainAtlas();
  const facade = atlasFacade(new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.85, metalness: 0.0 }), 4, 0.5, 'facadeAtlas');
  const curtain = atlasFacade(new THREE.MeshStandardMaterial({ map: c.map, emissiveMap: c.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.6 }), 8, 0.42, 'curtainAtlas');
  const roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const neon = nightGlow(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 0.85, 3.2, 'neonTube');
  const s = makeShopfrontAtlas();
  const shop = nightGlow(new THREE.MeshStandardMaterial({ map: s.map, emissiveMap: s.emissive, emissive: 0xffffff, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 0.05, 1.6, 'shopfront');
  const billboardTex = makeBillboardAtlas();
  const billboard = nightGlow(new THREE.MeshStandardMaterial({ map: billboardTex, emissiveMap: billboardTex, emissive: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), 0.0, 0.9, 'billboard');
  const blade = nightGlow(new THREE.MeshBasicMaterial({ map: makeHotelSignAtlas(), toneMapped: false }), 0.9, 1.7, 'bladeSign');
  return { facade, curtain, roof, neon, shop, billboard, blade };
}

// Walls of an axis-aligned box with floor-aligned facade UVs; bay width snaps so windows never get cut.
function walls(gb, cx, y0, cz, w, h, d, color, bay, perTile) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const v0 = y0 / (FLOOR * 4), v1 = y1 / (FLOOR * 4);
  const uv = (len) => {
    const u = Math.max(1, Math.round(len / bay)) / perTile;
    return [[0, v0], [u, v0], [u, v1], [0, v1]];
  };
  gb.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, uv(d));
  gb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, uv(d));
  gb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, uv(w));
  gb.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, uv(w));
}

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const lighten = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();

export function buildBuildings(scene, city, mats) {
  const L = {
    facade: new ChunkedGeo(CHUNK, -HALF), glass: new ChunkedGeo(CHUNK, -HALF), roof: new ChunkedGeo(CHUNK, -HALF),
    neon: new ChunkedGeo(CHUNK, -HALF), shop: new ChunkedGeo(CHUNK, -HALF),
  };
  const signs = new GeoBuilder();
  const boards = new GeoBuilder();
  const rng = makeRng(404);
  for (const b of city.buildings) {
    const ctx = {
      wall: (b.glass ? L.glass : L.facade).at(b.x, b.z), facade: L.facade.at(b.x, b.z), roof: L.roof.at(b.x, b.z),
      neon: L.neon.at(b.x, b.z), shop: L.shop.at(b.x, b.z), signs, rng,
    };
    addBuilding(ctx, b);
  }
  for (const bb of city.billboards || []) addBillboard(boards, L.roof.at(bb.x, bb.z), bb);
  // ads on the face of the taller towers (kept from the original layout, now from the brand atlas)
  for (const b of city.buildings) {
    if (b.h > 55 && !b.special && rng() < 0.5) {
      const top = b.h * (b.roof === 'tiers' ? 0.82 : 1);
      const zf = b.z + b.d / 2 * (b.roof === 'tiers' ? 0.6 : 1) + 0.3;
      addBillboard(boards, L.roof.at(b.x, b.z), { x: b.x, y: top - 4, z: zf, w: Math.min(b.w - 4, 20), h: Math.min(b.w - 4, 20) / 2, ry: 0, ad: Math.floor(rng() * 8), frame: false });
    }
  }

  const meshes = [];
  const add = (layer, mat, opts) => meshes.push(...layer.addTo(scene, mat, opts));
  add(L.facade, mats.facade);
  add(L.glass, mats.curtain);
  add(L.roof, mats.roof);
  add(L.neon, mats.neon, { cast: false, receive: false });
  add(L.shop, mats.shop, { cast: false });
  for (const [gb, mat] of [[signs, mats.blade], [boards, mats.billboard]]) {
    if (!gb.triCount) continue;
    const m = new THREE.Mesh(gb.build(), mat);
    m.receiveShadow = mat === mats.billboard;
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}

function addBuilding(c, b) {
  const { rng } = c;
  const bay = b.glass ? 2 : 4, perTile = b.glass ? 8 : 4;
  const style = b.glass ? (b.glassStyle ?? 0) : (b.style ?? 0);
  const seed = rng() * 100;
  const styleTag = () => c.wall.tag(style % 2, style >> 1, seed);
  let top = 0;
  if (b.podium) {
    const p = b.podium;
    c.facade.tag(0, 0, seed + 50);
    walls(c.facade, b.x, 0, b.z, p.w, p.h, p.d, p.color, 4, 4);
    c.roof.box(b.x, p.h, b.z, p.w + 0.6, 0.5, p.d + 0.6, lighten(p.color, 0.3));
    c.roof.box(b.x, p.h + 0.3, b.z, p.w - 1, 0.1, p.d - 1, 0x7d8c84, { noSides: true });
    top = p.h;
    if (b.shops) shopRow(c, b.x, b.z, p.w, p.d, rng);
  } else if (b.shops) shopRow(c, b.x, b.z, b.w, b.d, rng);
  styleTag();

  const tierFrac = b.roof === 'tiers' ? (b.tiers || []).reduce((s, t) => s + t.hf, 0) : 0;
  const mainH = b.h * (1 - tierFrac);
  walls(c.wall, b.x, top, b.z, b.w, mainH - top, b.d, b.color, bay, perTile);
  top = mainH;
  let w = b.w, d = b.d;
  const roofColor = b.roofColor ?? 0x8e8e94;
  const trim = b.glass ? 0xd8dde2 : lighten(b.color, 0.55);

  if (b.roof === 'tiers') {
    c.roof.box(b.x, top + 0.2, b.z, w + 0.4, 0.4, d + 0.4, trim);
    for (const t of b.tiers) {
      w *= t.f; d *= t.f;
      const th = b.h * t.hf;
      styleTag();
      walls(c.wall, b.x, top, b.z, w, th, d, b.color, bay, perTile);
      top += th;
      c.roof.box(b.x, top + 0.2, b.z, w + 0.4, 0.4, d + 0.4, trim);
    }
    c.roof.box(b.x, top + 0.45, b.z, w - 0.6, 0.1, d - 0.6, 0x6f747a, { noSides: true });
    rooftop(c, b, top + 0.4, w, d);
  } else if (b.roof === 'gable') {
    const rh = Math.min(b.w, b.d) * 0.34;
    const rc = b.roofColor ?? 0xb4503c;
    c.roof.box(b.x, top, b.z, b.w + 0.3, 0.3, b.d + 0.3, 0xf4f1ea); // eave band
    if (b.ridgeAlongX) {
      c.roof.at(b.x, top, b.z, 0);
      c.roof.prism([[-b.d / 2 - 0.7, 0], [b.d / 2 + 0.7, 0], [0, rh]], b.w + 1, rc, 0, 0, 0, { sideColor: b.color });
    } else {
      c.roof.at(b.x, top, b.z, Math.PI / 2);
      c.roof.prism([[-b.w / 2 - 0.7, 0], [b.w / 2 + 0.7, 0], [0, rh]], b.d + 1, rc, 0, 0, 0, { sideColor: b.color });
    }
    c.roof.at(0, 0, 0, 0);
    c.roof.box(b.x + b.w * 0.25, top + rh * 0.9, b.z, 1.1, 2.4, 1.1, 0xe8e2d6);
    // villa porch: white pergola beams over the entrance
    c.roof.box(b.x, 2.9, b.z + b.d / 2 + 1.6, b.w * 0.5, 0.25, 3.2, 0xf4f1ea);
    for (const sx of [-1, 1]) c.roof.box(b.x + sx * b.w * 0.24, 1.45, b.z + b.d / 2 + 3, 0.3, 2.9, 0.3, 0xf4f1ea);
  } else if (b.roof === 'sawtooth') {
    c.roof.box(b.x, top, b.z, w, 0.15, d, 0x7a7e84, { noSides: true });
    const n = 4, s = d / n;
    c.roof.at(b.x, top, b.z, 0);
    for (let k = 0; k < n; k++) {
      const z0 = -s / 2 + (k - (n - 1) / 2) * s;
      c.roof.prism([[z0, 0], [z0 + s, 0], [z0 + s, 2.2]], w * 0.98, 0x9aa1a8, 0, 0, 0, { edgeColors: [0x9aa1a8, 0x2a3a4a, 0x9aa1a8] });
    }
    c.roof.at(0, 0, 0, 0);
    // loading dock canopy and bollards
    c.roof.box(b.x, 4.6, b.z + d / 2 + 1.5, w * 0.7, 0.25, 3, 0x5d6670);
    for (let k = -2; k <= 2; k++) c.roof.box(b.x + k * w * 0.16, 0.6, b.z + d / 2 + 3.2, 0.35, 1.2, 0.35, 0xf2c230);
  } else {
    flatRoof(c, b, top, w, d, roofColor, trim);
  }

  if (b.balcony) balconies(c, b);
  if (b.neon) neonTrim(c, b, top);
}

function flatRoof(c, b, top, w, d, roofColor, trim) {
  c.roof.box(b.x, top, b.z, w, 0.12, d, roofColor, { noSides: true });
  const lip = 0.8, t = 0.45;
  c.roof.box(b.x, top + lip / 2, b.z - d / 2 + t / 2, w, lip, t, trim);
  c.roof.box(b.x, top + lip / 2, b.z + d / 2 - t / 2, w, lip, t, trim);
  c.roof.box(b.x - w / 2 + t / 2, top + lip / 2, b.z, t, lip, d - t * 2, trim);
  c.roof.box(b.x + w / 2 - t / 2, top + lip / 2, b.z, t, lip, d - t * 2, trim);
  // cornice band that reads from the street
  c.roof.box(b.x, top - 0.35, b.z, w + 0.5, 0.35, d + 0.5, trim);
  rooftop(c, b, top, w, d);
}

function rooftop(c, b, top, w, d) {
  const { rng } = c;
  const R = c.roof;
  switch (b.top) {
    case 'helipad': {
      const r = Math.min(w, d) * 0.36;
      R.cylinder(b.x, top + 0.5, b.z, r, 1, 0x4a4f57, 'y', 16);
      R.cylinder(b.x, top + 1.02, b.z, r * 0.92, 0.04, 0xf2c230, 'y', 16);
      R.cylinder(b.x, top + 1.05, b.z, r * 0.84, 0.04, 0x3a3f46, 'y', 16);
      R.box(b.x - r * 0.3, top + 1.1, b.z, r * 0.12, 0.04, r * 0.8, 0xffffff);
      R.box(b.x + r * 0.3, top + 1.1, b.z, r * 0.12, 0.04, r * 0.8, 0xffffff);
      R.box(b.x, top + 1.1, b.z, r * 0.6, 0.04, r * 0.12, 0xffffff);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        addGlow(b.x + Math.cos(a) * r * 0.95, top + 1.3, b.z + Math.sin(a) * r * 0.95, 2.2, 0x7cff9a, 'night');
      }
      break;
    }
    case 'spire': {
      R.box(b.x, top + 2, b.z, w * 0.4, 4, d * 0.4, 0xc9ced4);
      R.cylinder(b.x, top + 4 + 14, b.z, 0.5, 28, 0xe8ecef, 'y', 8);
      R.cylinder(b.x, top + 4 + 30, b.z, 0.2, 6, 0xe8ecef, 'y', 6);
      addGlow(b.x, top + 37.5, b.z, 5, 0xff3030, 'blink');
      break;
    }
    case 'crown': {
      // glass fins rising past the roof with a neon halo ring
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        R.box(b.x + Math.cos(a) * w * 0.42, top + 4, b.z + Math.sin(a) * d * 0.42, 0.6, 8, 0.6, 0xe8ecef);
      }
      const col = new THREE.Color(b.neon || '#6ee7ff').getHex();
      for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
        c.neon.beam([b.x + Math.cos(a0) * w * 0.44, top + 7.6, b.z + Math.sin(a0) * d * 0.44], [b.x + Math.cos(a1) * w * 0.44, top + 7.6, b.z + Math.sin(a1) * d * 0.44], 0.3, col);
      }
      addGlow(b.x, top + 8, b.z, Math.max(w, d) * 1.1, col, 'night', 0.35);
      break;
    }
    case 'antennas': {
      for (let k = 0; k < 3; k++) {
        const x = b.x + (rng() - 0.5) * w * 0.5, z = b.z + (rng() - 0.5) * d * 0.5, h = 6 + rng() * 10;
        R.cylinder(x, top + h / 2, z, 0.15, h, 0xdddddd, 'y', 5);
        addGlow(x, top + h + 0.3, z, 3, 0xff3030, 'blink');
      }
      R.cylinder(b.x + w * 0.25, top + 1.5, b.z - d * 0.2, 1.2, 0.3, 0xf0f0f0, 'x', 10);
      R.box(b.x, top + 1.5, b.z, w * 0.4, 3, d * 0.4, 0xbfc4c9);
      break;
    }
    case 'tank': {
      const x = b.x + (rng() - 0.5) * w * 0.4, z = b.z + (rng() - 0.5) * d * 0.4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.box(x + sx * 1.1, top + 1.5, z + sz * 1.1, 0.2, 3, 0.2, 0x5a4636);
      R.cylinder(x, top + 4.4, z, 1.8, 2.8, 0x8b5e3c, 'y', 10);
      R.pyramid(x, top + 5.8, z, 3.8, 1.1, 3.8, 0x6b4a32);
      hvac(R, b, top, w, d, rng, 1);
      break;
    }
    case 'deco': {
      // stepped art-deco crown on the street face with a flagpole
      const zf = b.z + d / 2 - 1;
      for (let k = 0; k < 3; k++) R.box(b.x, top + 1 + k * 1.2, zf, w * (0.5 - k * 0.13), 1.2, 1.6, lighten(b.color, 0.25 + k * 0.15));
      R.cylinder(b.x, top + 6.5, zf, 0.08, 5, 0xeeeeee, 'y', 5);
      R.box(b.x + 0.7, top + 8.4, zf, 1.3, 0.8, 0.05, b.neon ? new THREE.Color(b.neon).getHex() : 0x4cc9f0);
      hvac(R, b, top, w, d, rng, 1);
      break;
    }
    default:
      hvac(R, b, top, w, d, rng, 1 + Math.floor(rng() * 3));
  }
}

function hvac(R, b, top, w, d, rng, n) {
  for (let k = 0; k < n; k++) {
    const x = b.x + (rng() - 0.5) * w * 0.55, z = b.z - d * 0.15 + (rng() - 0.5) * d * 0.3;
    const sw = 2 + rng() * 3, sd = 2 + rng() * 2;
    R.box(x, top + 0.9, z, sw, 1.6, sd, 0xc9ccd1);
    R.cylinder(x, top + 1.75, z, Math.min(sw, sd) * 0.3, 0.12, 0x5d636b, 'y', 10);
  }
  if (b.h > 30) R.box(b.x + w * 0.22, top + 2.2, b.z - d * 0.2, 3, 4.4, 3, 0xaaaeb4);
}

function balconies(c, b) {
  const rail = b.glass ? 0xbfe3f2 : 0xf4f2ee;
  const slab = lighten(b.color, 0.6);
  const n = Math.max(1, Math.round(b.w / 7));
  const bw = (b.w * 0.92) / n;
  for (let y = FLOOR; y < b.h - 2; y += FLOOR) {
    for (let k = 0; k < n; k++) {
      const x = b.x - (b.w * 0.92) / 2 + bw * (k + 0.5);
      c.roof.box(x, y, b.z + b.d / 2 + 0.75, bw - 0.6, 0.2, 1.5, slab);
      c.roof.box(x, y + 0.55, b.z + b.d / 2 + 1.45, bw - 0.6, 0.9, 0.07, rail);
    }
  }
}

// Ground-floor shopfronts with striped awnings on the two street faces that see the most traffic.
function shopRow(c, x, z, w, d, rng) {
  for (const [face, len] of [[0, w], [1, d]]) {
    const n = Math.floor(len / (SHOP_W + 1.2));
    if (!n) continue;
    const gap = (len - n * SHOP_W) / (n + 1);
    for (let k = 0; k < n; k++) {
      const t = -len / 2 + gap + SHOP_W / 2 + k * (SHOP_W + gap);
      const shop = Math.floor(rng() * SHOPS.length);
      const u0 = (shop % 2) * 0.5, v0 = (shop >> 1) * 0.25;
      const uvs = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.25], [u0, v0 + 0.25]];
      const awn = new THREE.Color(SHOPS[shop].sign).getHex();
      if (face === 0) {
        const zf = z + d / 2 + 0.05;
        c.shop.quad([x + t - SHOP_W / 2, 0.18, zf], [x + t + SHOP_W / 2, 0.18, zf], [x + t + SHOP_W / 2, 0.18 + SHOP_H, zf], [x + t - SHOP_W / 2, 0.18 + SHOP_H, zf], 0xffffff, uvs);
        awning(c.roof, x + t, zf, 0, awn);
      } else {
        const xf = x + w / 2 + 0.05;
        c.shop.quad([xf, 0.18, z - t + SHOP_W / 2], [xf, 0.18, z - t - SHOP_W / 2], [xf, 0.18 + SHOP_H, z - t - SHOP_W / 2], [xf, 0.18 + SHOP_H, z - t + SHOP_W / 2], 0xffffff, uvs);
        awning(c.roof, xf, z - t, Math.PI / 2, awn);
      }
    }
  }
}

function awning(R, x, z, ry, color) {
  R.at(x, 2.55, z, ry);
  const stripes = 6, sw = (SHOP_W - 0.4) / stripes;
  for (let k = 0; k < stripes; k++) {
    const xc = -(SHOP_W - 0.4) / 2 + sw * (k + 0.5);
    R.prism([[0, 0.55], [1.5, 0], [1.5, -0.25], [0, 0.4]], sw, k % 2 ? 0xfaf7f0 : color, xc, 0, 0);
  }
  R.at(0, 0, 0, 0);
}

function neonTrim(c, b, top) {
  const col = new THREE.Color(b.neon).getHex();
  const N = c.neon;
  const zf = b.z + b.d / 2 + 0.12, xr = b.x + b.w / 2 + 0.12, xl = b.x - b.w / 2 - 0.12;
  const yTop = top - 0.6;
  // parapet line on the street face and both sides, plus vertical corner tubes
  N.box(b.x, yTop, zf, b.w + 0.2, 0.22, 0.12, col);
  N.box(xr, yTop, b.z, 0.12, 0.22, b.d, col);
  N.box(xl, yTop, b.z, 0.12, 0.22, b.d, col);
  N.box(xr, top / 2, zf, 0.16, top - 1, 0.16, col);
  N.box(xl, top / 2, zf, 0.16, top - 1, 0.16, col);
  N.box(b.x, 4.1, zf, b.w * 0.6, 0.18, 0.12, col);
  addGlow(b.x, yTop, zf + 0.5, Math.min(b.w, 26), col, 'night', 0.28);
  // vertical blade sign on the front corner of deco hotels
  if (b.hotel !== undefined && top > 12) {
    const h = Math.min(14, top - 6), y0 = top - h - 1.5, x = b.x + b.w / 2 - 2.5;
    const u0 = b.hotel / 8, u1 = (b.hotel + 1) / 8;
    const zi = b.z + b.d / 2 + 0.3, zo = b.z + b.d / 2 + 2.6;
    const uvs = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
    c.signs.quad([x + 0.14, y0, zo], [x + 0.14, y0, zi], [x + 0.14, y0 + h, zi], [x + 0.14, y0 + h, zo], 0xffffff, uvs); // faces +x
    c.signs.quad([x - 0.14, y0, zi], [x - 0.14, y0, zo], [x - 0.14, y0 + h, zo], [x - 0.14, y0 + h, zi], 0xffffff, uvs); // faces -x
    c.roof.box(x, y0 + h / 2, b.z + b.d / 2 + 1.45, 0.25, h + 0.4, 2.6, 0x2b2b35);
    addGlow(x, y0 + h / 2, b.z + b.d / 2 + 1.5, h * 0.9, col, 'night', 0.3);
  }
}

// Billboard panel from the brand atlas, optionally on a steel rooftop frame with a catwalk and spotlights.
function addBillboard(boards, R, bb) {
  const c = Math.cos(bb.ry), s = Math.sin(bb.ry);
  const P = (lx, y, lz) => [bb.x + lx * c + lz * s, y, bb.z - lx * s + lz * c];
  const y0 = bb.y + (bb.frame ? 1.6 : 0), y1 = y0 + bb.h;
  const u0 = (bb.ad % 2) * 0.5, v0 = (bb.ad >> 1) * 0.25;
  boards.quad(P(-bb.w / 2, y0, 0.15), P(bb.w / 2, y0, 0.15), P(bb.w / 2, y1, 0.15), P(-bb.w / 2, y1, 0.15), 0xffffff, [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.25], [u0, v0 + 0.25]]);
  if (!bb.frame) return;
  R.at(bb.x, 0, bb.z, bb.ry);
  R.box(0, (y0 + y1) / 2, 0, bb.w + 0.4, bb.h + 0.4, 0.25, 0x3a3f46);
  for (const lx of [-bb.w * 0.35, bb.w * 0.35]) {
    R.box(lx, (bb.y + y0) / 2 + 0.2, -0.3, 0.3, y0 - bb.y + 0.4, 0.3, 0x3a3f46);
    R.box(lx, y0 - 0.1, 0.9, 0.12, 0.12, 1.6, 0x3a3f46);
  }
  R.box(0, y0 - 0.2, 0.8, bb.w, 0.1, 1.2, 0x555b63);
  R.at(0, 0, 0, 0);
  for (const lx of [-bb.w * 0.3, 0, bb.w * 0.3]) {
    const p = P(lx, y0 - 0.05, 1.4);
    addGlow(p[0], p[1], p[2], 2, 0xfff2d0, 'night');
  }
}
