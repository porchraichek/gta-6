// Visible vehicle damage: dents pushed into body/trim vertices, cracked glass, broken lamps and bent wheels.
import { rgb } from './geomkit.js';
import { GLASS } from './vehicleModels.js';

const MAX_DENT = 0.32; // metres a vertex may move from where it was built
const GLASS_RGB = rgb(GLASS);
const CRACKED = rgb(0x8d9aa6);
const DEAD_LAMP = rgb(0x1a1414);

function original(geo) {
  if (!geo.userData.orig) geo.userData.orig = geo.attributes.position.array.slice();
  return geo.userData.orig;
}

// Push vertices near local point (lx, ly, lz) along local direction (dx, dz). Returns true if anything moved.
function dentGeometry(geo, lx, ly, lz, dx, dz, amount, radius, crackGlass) {
  const pos = geo.attributes.position;
  const arr = pos.array, orig = original(geo);
  const col = geo.attributes.color.array;
  let moved = false, recolor = false;
  const r2 = radius * radius;
  for (let i = 0; i < arr.length; i += 3) {
    const ex = orig[i] - lx, ey = (orig[i + 1] - ly) * 0.7, ez = orig[i + 2] - lz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 > r2) continue;
    const f = 1 - Math.sqrt(d2) / radius;
    const k = amount * f * f;
    let nx = arr[i] + dx * k, ny = arr[i + 1] - k * 0.35, nz = arr[i + 2] + dz * k;
    // never move a vertex further than MAX_DENT from its built position
    const ox = nx - orig[i], oy = ny - orig[i + 1], oz = nz - orig[i + 2];
    const ol = Math.hypot(ox, oy, oz);
    if (ol > MAX_DENT) { const s = MAX_DENT / ol; nx = orig[i] + ox * s; ny = orig[i + 1] + oy * s; nz = orig[i + 2] + oz * s; }
    arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz;
    moved = true;
    if (crackGlass && f > 0.25 && Math.abs(col[i] - GLASS_RGB[0]) < 0.02 && Math.abs(col[i + 1] - GLASS_RGB[1]) < 0.02 && Math.abs(col[i + 2] - GLASS_RGB[2]) < 0.02) {
      col[i] = CRACKED[0]; col[i + 1] = CRACKED[1]; col[i + 2] = CRACKED[2];
      recolor = true;
    }
  }
  if (moved) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  if (recolor) geo.attributes.color.needsUpdate = true;
  return moved;
}

function breakLamp(mesh, lamp) {
  if (lamp.broken) return;
  lamp.broken = true;
  const col = mesh.geometry.attributes.color;
  for (let v = lamp.s; v < lamp.e; v++) col.setXYZ(v, DEAD_LAMP[0], DEAD_LAMP[1], DEAD_LAMP[2]);
  col.needsUpdate = true;
}

// Apply an impact at world point (px, pz) pushing along world direction (nx, nz) with strength 0..1.
export function applyImpactDamage(v, px, pz, nx, nz, strength) {
  if (strength <= 0.02) return;
  const m = v.model, def = v.def;
  const s = Math.sin(v.heading), c = Math.cos(v.heading);
  const wx = px - v.x, wz = pz - v.z;
  const lx = wx * c - wz * s, lz = wx * s + wz * c;
  const dx = nx * c - nz * s, dz = nx * s + nz * c;
  const amount = Math.min(0.28, strength * 0.3);
  const radius = 0.7 + strength * 0.9 + def.width * 0.15;
  const ly = def.kind === 'boat' ? 0.5 : 0.65;
  dentGeometry(m.bodyMesh.geometry, lx, ly, lz, dx, dz, amount, radius, false);
  dentGeometry(m.trimMesh.geometry, lx, ly, lz, dx, dz, amount * 0.8, radius, strength > 0.25);
  v.dents = (v.dents || 0) + strength;

  // lamps at the struck end break on solid hits
  const hl = def.length / 2;
  if (strength > 0.18) {
    const end = lz > hl * 0.45 ? 'head' : lz < -hl * 0.45 ? 'tail' : null;
    if (end) {
      const side = Math.abs(lx) < def.width * 0.18 ? 0 : Math.sign(lx);
      const mesh = end === 'head' ? m.headMesh : m.tailMesh;
      for (const lamp of m.lamps[end]) if (side === 0 || lamp.side === side || lamp.side === 0) breakLamp(mesh, lamp);
    }
  }
  // a hard knock near a wheel bends it: the car pulls to that side
  if (strength > 0.3) {
    for (const w of m.wheels) {
      if (w.bent > 0 || Math.abs(lz - w.z) > 1.0 || (w.side && Math.sign(lx) !== w.side)) continue;
      w.bent = 1;
      w.pivot.rotation.z = (w.side || 1) * 0.14;
      v.pull = (v.pull || 0) + (w.side || 1) * (w.front ? 0.09 : 0.05);
      break;
    }
  }
}

export function headlightsWorking(v) {
  const lamps = v.model.lamps.head;
  let ok = 0;
  for (const l of lamps) if (!l.broken) ok++;
  return lamps.length ? ok / lamps.length : 0;
}

// Charred look for an exploded wreck.
export function scorchModel(v) {
  const m = v.model;
  m.bodyMat.color.setHex(0x1a1a1a);
  m.bodyMat.roughness = 1;
  m.bodyMat.metalness = 0;
  for (const l of m.lamps.head) breakLamp(m.headMesh, l);
  for (const l of m.lamps.tail) breakLamp(m.tailMesh, l);
}
