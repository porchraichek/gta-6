// Builds low-poly vehicle meshes (body, glass/trim, lights, wheels) for every vehicle archetype.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { VEHICLES } from './config.js';

const GLASS = 0x1c2a3a;
const DARK = 0x16181c;
const geoCache = new Map();
let wheelGeo = null;

function wheelGeometry(r, w) {
  const gb = new GeoBuilder();
  gb.cylinder(0, 0, 0, r, w, 0x151515, 'x', 12, 0x9aa2ab);
  return gb.build();
}

// Shape parameters per type: belt height, roof, cabin z-extents (front-base, front-roof, rear-roof, rear-base)
const SHAPES = {
  compact: { belt: 0.82, roof: 1.32, cf0: 0.55, cf1: 0.05, cr1: -1.0, cr0: -1.55, wheel: 0.32, spoiler: false },
  sedan: { belt: 0.88, roof: 1.4, cf0: 0.75, cf1: 0.2, cr1: -0.95, cr0: -1.4, wheel: 0.34 },
  sports: { belt: 0.72, roof: 1.12, cf0: 0.55, cf1: -0.15, cr1: -0.9, cr0: -1.25, wheel: 0.34, spoiler: true },
  pickup: { belt: 1.02, roof: 1.85, cf0: 1.05, cf1: 0.5, cr1: -0.45, cr0: -0.55, wheel: 0.42, bed: true },
  van: { belt: 1.0, roof: 2.4, cf0: 2.1, cf1: 1.85, cr1: -2.55, cr0: -2.65, wheel: 0.38, box: true },
  cruiser: { belt: 0.9, roof: 1.45, cf0: 0.8, cf1: 0.25, cr1: -0.95, cr0: -1.45, wheel: 0.35, bar: true },
  swat: { belt: 1.15, roof: 2.3, cf0: 1.95, cf1: 1.7, cr1: -2.7, cr0: -2.8, wheel: 0.45, bar: true, armor: true },
};

export function buildVehicleModel(type, paint) {
  const color = 0xffffff; // body vertex colour stays white; the paint tints bodyMat
  const def = VEHICLES[type];
  const sh = SHAPES[type];
  const L = def.length, W = def.width, H = def.height;
  const hl = L / 2;
  const y0 = 0.28;

  const body = new GeoBuilder();
  const trim = new GeoBuilder();
  const lights = new GeoBuilder();
  const wr = sh.wheel;

  // lower hull with a sloped hood and a short deck
  body.prism(
    [[-hl, y0 + 0.05], [hl, y0 + 0.05], [hl, sh.belt - 0.14], [hl - 0.35, sh.belt - 0.02], [hl - 1.0, sh.belt], [-hl + 0.4, sh.belt], [-hl, sh.belt - 0.1]],
    W, color,
  );
  // cabin glass
  const cw = W * 0.9;
  if (sh.box) {
    body.prism([[sh.cr0, sh.belt], [sh.cf0 + 0.3, sh.belt], [sh.cf0 + 0.3, sh.roof], [sh.cr0, sh.roof]], W * 0.98, color);
    // windscreen & side windows band
    trim.prism([[sh.cf1 - 0.3, sh.belt + 0.55], [sh.cf0 + 0.31, sh.belt + 0.55], [sh.cf0 + 0.31, sh.roof - 0.25], [sh.cf1 - 0.3, sh.roof - 0.25]], W * 0.99, GLASS);
  } else {
    trim.prism([[sh.cr0, sh.belt], [sh.cf0, sh.belt], [sh.cf1, sh.roof], [sh.cr1, sh.roof]], cw, GLASS);
    body.prism([[sh.cr1 - 0.05, sh.roof - 0.02], [sh.cf1 + 0.05, sh.roof - 0.02], [sh.cf1 + 0.05, sh.roof + 0.05], [sh.cr1 - 0.05, sh.roof + 0.05]], cw + 0.04, color);
    // B pillar
    const mz = (sh.cr0 + sh.cf0) / 2 - 0.15;
    body.box(0, (sh.belt + sh.roof) / 2, mz, cw + 0.03, sh.roof - sh.belt, 0.12, color, { noTop: true });
  }
  if (sh.bed) {
    // open cargo bed behind the cab
    const bz0 = -hl + 0.05, bz1 = sh.cr0 - 0.1;
    body.box(0, sh.belt + 0.12, (bz0 + bz1) / 2, W, 0.28, bz1 - bz0, color, { noTop: true });
    trim.box(0, sh.belt + 0.02, (bz0 + bz1) / 2, W - 0.3, 0.02, bz1 - bz0 - 0.3, 0x2a2a2e);
  }
  if (sh.spoiler) {
    body.box(0, sh.belt + 0.32, -hl + 0.15, W * 0.9, 0.06, 0.4, color);
    body.box(W * 0.35, sh.belt + 0.18, -hl + 0.2, 0.06, 0.28, 0.12, color);
    body.box(-W * 0.35, sh.belt + 0.18, -hl + 0.2, 0.06, 0.28, 0.12, color);
  }
  if (sh.armor) {
    trim.box(0, sh.belt - 0.05, hl - 0.05, W, 0.35, 0.3, 0x2c3138);
    trim.box(0, 1.5, 0, W + 0.02, 0.18, L * 0.55, 0x2c3138);
  }
  // bumpers, grille, sills
  trim.box(0, y0 + 0.14, hl - 0.04, W + 0.04, 0.26, 0.2, DARK);
  trim.box(0, y0 + 0.14, -hl + 0.04, W + 0.04, 0.26, 0.2, DARK);
  trim.box(0, y0 + 0.5, hl + 0.01, W * 0.5, 0.18, 0.06, 0x0e0f12);
  trim.box(W / 2 + 0.005, y0 + 0.08, 0, 0.02, 0.1, L * 0.7, DARK, {});
  trim.box(-W / 2 - 0.005, y0 + 0.08, 0, 0.02, 0.1, L * 0.7, DARK, {});
  if (type === 'cruiser') {
    // white door panels + stripe
    for (const sx of [-1, 1]) {
      trim.box(sx * (W / 2 + 0.012), (y0 + sh.belt) / 2 + 0.02, -0.15, 0.01, sh.belt - y0 - 0.25, 2.1, 0xf2f4f8);
      trim.box(sx * (W / 2 + 0.014), (y0 + sh.belt) / 2 + 0.05, -0.15, 0.01, 0.1, 1.9, 0x2c6bff);
    }
    trim.box(0, sh.belt + 0.02, hl - 0.8, W * 0.7, 0.012, 1.0, 0xf2f4f8);
    trim.box(0, sh.belt + 0.02, -hl + 0.7, W * 0.7, 0.012, 0.9, 0xf2f4f8);
  }
  // lamps
  lights.box(W * 0.33, y0 + 0.5, hl + 0.01, 0.38, 0.16, 0.06, 0xfff4d0);
  lights.box(-W * 0.33, y0 + 0.5, hl + 0.01, 0.38, 0.16, 0.06, 0xfff4d0);
  const tail = new GeoBuilder();
  tail.box(W * 0.34, y0 + 0.5, -hl - 0.01, 0.4, 0.14, 0.05, 0xff2a2a);
  tail.box(-W * 0.34, y0 + 0.5, -hl - 0.01, 0.4, 0.14, 0.05, 0xff2a2a);

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, color: paint, envMapIntensity: 1.2 });
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.3 });
  const bodyMesh = new THREE.Mesh(body.build(), bodyMat);
  const trimMesh = new THREE.Mesh(trim.build(), trimMat);
  bodyMesh.castShadow = true;
  trimMesh.castShadow = true;
  const headMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0x883333 });
  const headMesh = new THREE.Mesh(lights.build(), headMat);
  const tailMesh = new THREE.Mesh(tail.build(), tailMat);
  group.add(bodyMesh, trimMesh, headMesh, tailMesh);

  // wheels: pivot -> spinning mesh
  const key = `${wr}`;
  if (!geoCache.has(key)) geoCache.set(key, wheelGeometry(wr, 0.28));
  wheelGeo = geoCache.get(key);
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const wheels = [];
  const wb = hl * 0.62;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.08), wr, sz * wb);
    const m = new THREE.Mesh(wheelGeo, wheelMat);
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    wheels.push({ pivot, mesh: m, front: sz > 0 });
  }

  // driver silhouette
  const dgb = new GeoBuilder();
  dgb.box(0, 0.25, 0, 0.5, 0.55, 0.28, 0x39465c);
  dgb.box(0, 0.68, 0, 0.26, 0.28, 0.26, 0xd9a47c);
  const driver = new THREE.Mesh(dgb.build(), new THREE.MeshStandardMaterial({ vertexColors: true }));
  driver.position.set(type === 'van' || type === 'swat' ? W * 0.22 : W * 0.22, sh.belt + 0.05, sh.cf0 - (sh.cf0 - sh.cr1) * 0.5);
  driver.position.z = sh.box ? sh.cf1 - 0.3 : (sh.cf1 + sh.cr1) / 2 + 0.2;
  driver.position.y = sh.belt - 0.5;
  driver.scale.setScalar(0.85);
  driver.visible = false;
  group.add(driver);

  // roof light bar for emergency vehicles
  let bar = null;
  if (sh.bar) {
    const bgb = new GeoBuilder();
    bgb.box(-0.32, 0, 0, 0.6, 0.12, 0.25, 0xffffff);
    const bgb2 = new GeoBuilder();
    bgb2.box(0.32, 0, 0, 0.6, 0.12, 0.25, 0xffffff);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2a55ff, toneMapped: false });
    const a = new THREE.Mesh(bgb.build(), redMat), b = new THREE.Mesh(bgb2.build(), blueMat);
    const y = sh.roof + 0.14;
    a.position.set(0, y, (sh.cf1 + sh.cr1) / 2);
    b.position.copy(a.position);
    group.add(a, b);
    bar = { redMat, blueMat };
  }

  // soft contact shadow under the car
  return { group, bodyMat, trimMat, headMat, tailMat, wheels, driver, bar, bodyMesh, trimMesh, wheelRadius: wr, def };
}

export function setPaint(model, color) {
  // body colour is baked in vertex colours; tint the whole body material instead
  model.bodyMat.color.set(color);
}
