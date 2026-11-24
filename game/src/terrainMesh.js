// Ground meshes: island sand, block slabs, grass patches, pools, and the road surface with markings.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { makeRoadTexture, makeIntersectionTexture, makeGrassTexture } from './textures.js';
import { N, BLOCK, HALF, ISLAND, ROAD, SIDEWALK_H } from './config.js';
import { nodeX, nodeZ } from './roadnet.js';

const SAND = 0xead7a6, SAND_WET = 0xb59f74;

function groundQuad(gb, x0, z0, x1, z1, y, color, uvs) {
  gb.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, uvs);
}

export function buildTerrain(scene, city) {
  const group = new THREE.Group();
  scene.add(group);

  // --- island sand with sloped skirt into the sea
  const sand = new GeoBuilder();
  groundQuad(sand, -ISLAND, -ISLAND, ISLAND, ISLAND, 0, SAND);
  const S = ISLAND, E = ISLAND + 46, depth = -3.2;
  // four sloped skirts
  sand.quad([-S, 0, S], [S, 0, S], [E, depth, E], [-E, depth, E], SAND_WET);
  sand.quad([S, 0, -S], [-S, 0, -S], [-E, depth, -E], [E, depth, -E], SAND_WET);
  sand.quad([S, 0, S], [S, 0, -S], [E, depth, -E], [E, depth, E], SAND_WET);
  sand.quad([-S, 0, -S], [-S, 0, S], [-E, depth, E], [-E, depth, -E], SAND_WET);
  const sandMesh = new THREE.Mesh(sand.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  sandMesh.receiveShadow = true;
  group.add(sandMesh);

  // --- block slabs (sidewalk top) and inner patches
  const slab = new GeoBuilder();
  const patchGrass = new GeoBuilder();
  const patchOther = new GeoBuilder();
  const h = SIDEWALK_H;
  for (const b of city.blocks) {
    const x0 = b.cx - BLOCK / 2, x1 = b.cx + BLOCK / 2, z0 = b.cz - BLOCK / 2, z1 = b.cz + BLOCK / 2;
    slab.box(b.cx, h / 2, b.cz, BLOCK, h, BLOCK, 0xd2cabc, { noTop: false });
    const inset = 4.5;
    const px0 = x0 + inset, px1 = x1 - inset, pz0 = z0 + inset, pz1 = z1 - inset;
    switch (b.district) {
      case 'hills':
      case 'park':
        groundQuad(patchGrass, px0, pz0, px1, pz1, h + 0.015, b.district === 'park' ? 0x6fb35a : 0x7bb35f, [[0, 0], [8, 0], [8, 8], [0, 8]]);
        break;
      case 'beach':
        groundQuad(patchOther, px0, pz0, px1, pz1, h + 0.015, 0xf1e1b4);
        break;
      case 'harbor':
        groundQuad(patchOther, x0 + 1, z0 + 1, x1 - 1, z1 - 1, h + 0.015, 0x858a92);
        break;
      default:
        groundQuad(patchOther, px0 + 1, pz0 + 1, px1 - 1, pz1 - 1, h + 0.015, 0xbdb7ab);
    }
  }
  // pools & ponds
  const water = new GeoBuilder();
  for (const p of city.pools) {
    if (p.round) {
      const seg = 20;
      const cx = p.x, cz = p.z, y = h + 0.05;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        water.rawTri([cx, y, cz], [cx + Math.cos(a1) * p.w / 2, y, cz + Math.sin(a1) * p.d / 2], [cx + Math.cos(a0) * p.w / 2, y, cz + Math.sin(a0) * p.d / 2], p.color);
      }
    } else {
      groundQuad(water, p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, h + 0.05, p.color);
      // pale deck around the pool
      groundQuad(patchOther, p.x - p.w / 2 - 1.2, p.z - p.d / 2 - 1.2, p.x + p.w / 2 + 1.2, p.z + p.d / 2 + 1.2, h + 0.03, 0xf3efe6);
    }
  }
  const slabMesh = new THREE.Mesh(slab.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  slabMesh.receiveShadow = true;
  group.add(slabMesh);
  const grassTex = makeGrassTexture();
  const grassMesh = new THREE.Mesh(patchGrass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 }));
  grassMesh.receiveShadow = true;
  group.add(grassMesh);
  const otherMesh = new THREE.Mesh(patchOther.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  otherMesh.receiveShadow = true;
  group.add(otherMesh);
  const poolMesh = new THREE.Mesh(water.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3 }));
  poolMesh.receiveShadow = true;
  group.add(poolMesh);

  // --- roads
  const segs = new GeoBuilder();
  const ints = new GeoBuilder();
  const y = 0.04;
  const R = ROAD / 2;
  for (let k = 0; k <= N; k++) {
    for (let m = 0; m < N; m++) {
      // horizontal road k (z=nodeZ(k)) between node m and m+1
      const xa = nodeX(m) + R, xb = nodeX(m + 1) - R, zc = nodeZ(k);
      const va = xa / ROAD, vb = xb / ROAD;
      segs.quad([xa, y, zc + R], [xb, y, zc + R], [xb, y, zc - R], [xa, y, zc - R], 0xffffff, [[1, va], [1, vb], [0, vb], [0, va]]);
      // vertical road k (x=nodeX(k)) between node m and m+1
      const za = nodeZ(m) + R, zb = nodeZ(m + 1) - R, xc = nodeX(k);
      const wa = za / ROAD, wb = zb / ROAD;
      segs.quad([xc - R, y, zb], [xc + R, y, zb], [xc + R, y, za], [xc - R, y, za], 0xffffff, [[0, wb], [1, wb], [1, wa], [0, wa]]);
    }
    for (let m = 0; m <= N; m++) {
      const cx = nodeX(k), cz = nodeZ(m);
      ints.quad([cx - R, y + 0.005, cz + R], [cx + R, y + 0.005, cz + R], [cx + R, y + 0.005, cz - R], [cx - R, y + 0.005, cz - R], 0xffffff, [[0, 1], [1, 1], [1, 0], [0, 0]]);
    }
  }
  const roadMat = new THREE.MeshStandardMaterial({ map: makeRoadTexture(), vertexColors: true, roughness: 0.92 });
  const intMat = new THREE.MeshStandardMaterial({ map: makeIntersectionTexture(), vertexColors: true, roughness: 0.92 });
  const segMesh = new THREE.Mesh(segs.build(), roadMat);
  const intMesh = new THREE.Mesh(ints.build(), intMat);
  segMesh.receiveShadow = intMesh.receiveShadow = true;
  group.add(segMesh, intMesh);

  // kerb lips along the block edges to give the roads depth
  return { group, roadMat, intMat };
}

