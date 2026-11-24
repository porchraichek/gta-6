// Street furniture and scenery as instanced meshes: palms, trees, lamps, containers, umbrellas, signs and traffic lights.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { makeSignTexture } from './textures.js';
import { makeRng } from './random.js';
import { N, LANE, ROAD } from './config.js';
import { nodeX, nodeZ } from './roadnet.js';

function palmGeometry() {
  const gb = new GeoBuilder();
  // trunk: stacked tapered segments with a gentle lean
  const segs = 6;
  for (let s = 0; s < segs; s++) {
    const y = s * 1.3 + 0.65, lean = Math.pow(s / segs, 2) * 1.2;
    gb.cylinder(lean, y, 0, 0.26 - s * 0.02, 1.35, s % 2 ? 0x8b6b4a : 0x7b5c3e, 'y', 7);
  }
  const top = segs * 1.3, lx = Math.pow(1, 2) * 1.2 * 0.85;
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.55;
    const base = [lx, top, 0];
    const mid = [lx + ca * 2.0, top + 0.9, sa * 2.0];
    const tip = [lx + ca * 3.6, top - 0.6, sa * 3.6];
    const px = -sa * w, pz = ca * w;
    const c = f % 2 ? 0x3f8f43 : 0x2f7a3a;
    gb.rawTri(base, [mid[0] + px, mid[1], mid[2] + pz], [mid[0] - px, mid[1], mid[2] - pz], c);
    gb.rawTri([mid[0] + px, mid[1], mid[2] + pz], tip, [mid[0] - px, mid[1], mid[2] - pz], c);
  }
  return gb.build();
}

function treeGeometry() {
  const gb = new GeoBuilder();
  gb.cylinder(0, 1.4, 0, 0.3, 2.8, 0x6b4a32, 'y', 6);
  gb.blob(0, 4.4, 0, 2.3, 0x4f9a48, 0.9, 1, 0.14, 3);
  gb.blob(1.2, 3.7, 0.5, 1.5, 0x5fae52, 0.9, 1, 0.14, 7);
  gb.blob(-1.1, 3.9, -0.6, 1.6, 0x438a40, 0.9, 1, 0.14, 11);
  return gb.build();
}

function lampGeometry() {
  const gb = new GeoBuilder();
  gb.cylinder(0, 3.8, 0, 0.11, 7.6, 0x555b63, 'y', 6);
  gb.box(0, 7.55, 0.9, 0.12, 0.12, 1.9, 0x555b63);
  return gb.build();
}

function umbrellaGeometry() {
  const gb = new GeoBuilder();
  gb.cylinder(0, 1.2, 0, 0.04, 2.4, 0xdddddd, 'y', 5);
  gb.pyramid(0, 2.3, 0, 3.0, 0.7, 3.0, 0xffffff);
  return gb.build();
}

function instanced(scene, geo, mat, count, setter, castShadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const r = setter(i);
    e.set(0, r.ry || 0, 0);
    q.setFromEuler(e);
    s.set(r.sx ?? r.s ?? 1, r.sy ?? r.s ?? 1, r.sz ?? r.s ?? 1);
    p.set(r.x, r.y || 0, r.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (r.color !== undefined) mesh.setColorAt(i, new THREE.Color(r.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function buildProps(scene, city) {
  const rng = makeRng(808);
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const out = { updaters: [] };

  const palms = city.palms;
  instanced(scene, palmGeometry(), vcMat, palms.length, (i) => ({ x: palms[i][0], z: palms[i][1], y: 0.18, ry: rng() * 6.28, s: 0.85 + rng() * 0.5 }));
  const trees = city.trees;
  if (trees.length) instanced(scene, treeGeometry(), solidMat, trees.length, (i) => ({ x: trees[i][0], z: trees[i][1], y: 0.18, ry: rng() * 6.28, s: trees[i][2] }));

  // lamps: poles + glowing heads (heads brighten at night)
  const lamps = city.lamps;
  instanced(scene, lampGeometry(), solidMat, lamps.length, (i) => ({ x: lamps[i][0], z: lamps[i][1], y: 0.18, ry: lamps[i][2] }));
  const headMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  const heads = instanced(scene, headGeo, headMat, lamps.length, (i) => {
    const ry = lamps[i][2];
    return { x: lamps[i][0] + Math.sin(ry) * 1.55, z: lamps[i][1] + Math.cos(ry) * 1.55, y: 7.75, ry };
  }, false);
  heads.frustumCulled = false;
  out.lampHeadMat = headMat;

  // containers & misc boxes with per-instance colour
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 });
  const cs = city.containers;
  if (cs.length) instanced(scene, boxGeo, boxMat, cs.length, (i) => ({ x: cs[i].x, y: cs[i].y, z: cs[i].z, sx: cs[i].w, sy: cs[i].h, sz: cs[i].d, color: cs[i].color }));
  const misc = city.props.filter((p) => p.w && !p.heli);
  if (misc.length) instanced(scene, boxGeo, boxMat, misc.length, (i) => ({ x: misc[i].x, y: misc[i].y + misc[i].h / 2, z: misc[i].z, sx: misc[i].w, sy: misc[i].h, sz: misc[i].d, color: misc[i].color }), false);
  const umbrellas = city.props.filter((p) => p.umbrella);
  if (umbrellas.length) instanced(scene, umbrellaGeometry(), solidMat, umbrellas.length, (i) => ({ x: umbrellas[i].x, z: umbrellas[i].z, y: 0, ry: rng() * 6, color: umbrellas[i].color }));

  // cranes and antennas as small merged geometry
  const gb = new GeoBuilder();
  for (const p of city.props) {
    if (p.crane) {
      gb.at(p.x, 0, p.z, 0);
      gb.box(0, 14, 0, 1.4, 28, 1.4, 0xd9533a);
      gb.box(14, 28.5, 0, 44, 1.2, 1.4, 0xd9533a);
      gb.box(-9, 28, 0, 8, 2, 2, 0x555b63);
      gb.box(26, 24, 0, 0.3, 8, 0.3, 0x333333);
      gb.at(0, 0, 0, 0);
    } else if (p.antenna) {
      gb.cylinder(p.x, p.antenna + 12, p.z, 0.25, 24, 0xdddddd, 'y', 5);
      gb.box(p.x, p.antenna + 22, p.z, 0.8, 0.8, 0.8, 0xff3b3b);
    } else if (p.heli) {
      gb.box(p.x, p.y + 0.1, p.z, 10, 0.2, 10, 0xe63946);
      gb.box(p.x, p.y + 0.25, p.z, 8, 0.05, 1.4, 0xffffff);
      gb.box(p.x, p.y + 0.25, p.z, 1.4, 0.05, 8, 0xffffff);
    }
  }
  if (gb.triCount) {
    const m = new THREE.Mesh(gb.build(), solidMat);
    m.castShadow = true;
    scene.add(m);
  }

  // signs (neon panels) on landmarks, and rooftop ads
  const signMeshes = [];
  const adTexts = [['SUN PALM', '#ffd166'], ['DRINK CORAL', '#ff7aa8'], ['VESPER', '#7be0ff'], ['NIGHTCAP', '#c792ff'], ['BAY TV', '#8dffb0'], ['SOLARIS', '#ffb347']];
  for (const s of city.signs) {
    if (s.ad || !s.text) continue;
    const tex = makeSignTexture(s.text, s.color, '#14141f', 512, 128);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    m.position.set(s.x, s.y + s.h / 2, s.z);
    scene.add(m);
    signMeshes.push(m);
  }
  for (const b of city.buildings) {
    if (b.h > 55 && !b.special && rng() < 0.5) {
      const [t, c] = adTexts[Math.floor(rng() * adTexts.length)];
      const tex = makeSignTexture(t, c, '#10101a', 512, 128);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w - 2, 22), 5.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.position.set(b.x, b.h * (b.roof === 'tiers' ? 0.82 : 1) + 3.2, b.z + b.d / 2 * (b.roof === 'tiers' ? 0.6 : 1) + 0.2);
      scene.add(m);
    }
  }

  buildSignals(scene, out);
  return out;
}

// Traffic lights: a coloured lamp per approach, updated each phase change from roadnet.lightState.
function buildSignals(scene, out) {
  const geo = new THREE.BoxGeometry(0.45, 0.45, 0.2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const count = (N + 1) * (N + 1) * 4;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 5.5, 5);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f57 }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const entries = [];
  let n = 0;
  const off = ROAD / 2 + 0.8;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const cx = nodeX(i), cz = nodeZ(j);
      // four corner poles; each serves an approach axis
      const corners = [[1, 1, 'x'], [-1, 1, 'z'], [-1, -1, 'x'], [1, -1, 'z']];
      for (const [sx, sz, axis] of corners) {
        const x = cx + sx * off, z = cz + sz * off;
        p.set(x, 2.75, z);
        q.identity();
        m.compose(p, q, one);
        poles.setMatrixAt(n, m);
        p.set(x - sx * 0.0, 5.3, z);
        e.set(0, axis === 'x' ? (sx > 0 ? -Math.PI / 2 : Math.PI / 2) : (sz > 0 ? Math.PI : 0), 0);
        q.setFromEuler(e);
        m.compose(p, q, one);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, new THREE.Color(0x00ff66));
        entries.push({ i, j, axis, idx: n });
        n++;
      }
    }
  }
  mesh.count = n;
  poles.count = n;
  mesh.frustumCulled = false;
  poles.frustumCulled = false;
  scene.add(mesh, poles);
  const green = new THREE.Color(0x30ff80), yellow = new THREE.Color(0xffc934), red = new THREE.Color(0xff3030);
  out.updateSignals = (stateFn) => {
    for (const en of entries) {
      const s = stateFn(en.i, en.j, en.axis);
      mesh.setColorAt(en.idx, s === 'green' ? green : s === 'yellow' ? yellow : red);
    }
    mesh.instanceColor.needsUpdate = true;
  };
  void LANE;
}
