// GeoBuilder: bakes boxes, prisms and cylinders into one vertex-coloured BufferGeometry,
// so whole buildings, chunks and vehicles render in a handful of draw calls.
import * as THREE from 'three';

const colorCache = new Map();
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  let c = colorCache.get(hex);
  if (!c) {
    const t = new THREE.Color(hex);
    c = [t.r, t.g, t.b];
    colorCache.set(hex, c);
  }
  return c;
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    this.cos = 1;
    this.sin = 0;
    this.tagv = null; // optional per-vertex vec3 (e.g. facade atlas cell + seed); attribute 'tag' when used
    this.tags = [];
  }

  // Set the per-vertex tag written for following geometry (null disables). Any tagged geometry adds a 'tag' attribute.
  tag(a = 0, b = 0, c = 0) {
    this.tagv = [a, b, c];
    return this;
  }

  // Set a local transform (translate then yaw) applied to everything added afterwards.
  at(x = 0, y = 0, z = 0, ry = 0) {
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.cos = Math.cos(ry);
    this.sin = Math.sin(ry);
    return this;
  }

  P(x, y, z) {
    return [this.tx + x * this.cos + z * this.sin, this.ty + y, this.tz - x * this.sin + z * this.cos];
  }

  // Triangle from world-space points. If `hint` is given the normal is flipped to face away from it.
  rawTri(a, b, c, color, uvs, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (hint) {
      const mx = (a[0] + b[0] + c[0]) / 3 - hint[0], my = (a[1] + b[1] + c[1]) / 3 - hint[1], mz = (a[2] + b[2] + c[2]) / 3 - hint[2];
      if (nx * mx + ny * my + nz * mz < 0) {
        const t = b; b = c; c = t;
        nx = -nx; ny = -ny; nz = -nz;
        if (uvs) uvs = [uvs[0], uvs[2], uvs[1]];
      }
    }
    const k = rgb(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(k[0], k[1], k[2]);
    }
    if (uvs) for (const u of uvs) this.uv.push(u[0], u[1]);
    else this.uv.push(0, 0, 0, 0, 0, 0);
    if (this.tagv || this.tags.length) {
      if (this.tags.length < (this.pos.length / 3 - 3) * 3) this.tags.length = (this.pos.length / 3 - 3) * 3; // back-fill untagged
      const t = this.tagv || [0, 0, 0];
      this.tags.push(t[0], t[1], t[2], t[0], t[1], t[2], t[0], t[1], t[2]);
    }
  }

  // Square-section beam between two world points (spokes, braces, poles at an angle).
  beam(a, b, size, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const f = [dx / len, dy / len, dz / len];
    const up = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const rl = Math.hypot(...r);
    r = r.map((v) => (v / rl) * size / 2);
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]]; // |u| = |r| since f is unit
    const P = (p, sr, su) => this.P(p[0] + r[0] * sr + u[0] * su, p[1] + r[1] * sr + u[1] * su, p[2] + r[2] * sr + u[2] * su);
    const c = this.P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    const s = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const A0 = P(a, ...s[i]), A1 = P(a, ...s[j]), B0 = P(b, ...s[i]), B1 = P(b, ...s[j]);
      this.rawTri(A0, B0, B1, color, null, c);
      this.rawTri(A0, B1, A1, color, null, c);
    }
  }

  // Quad in local space, CCW seen from outside. uvs optional array of 4 [u,v].
  quad(p0, p1, p2, p3, color, uvs) {
    const a = this.P(...p0), b = this.P(...p1), c = this.P(...p2), d = this.P(...p3);
    this.rawTri(a, b, c, color, uvs && [uvs[0], uvs[1], uvs[2]]);
    this.rawTri(a, c, d, color, uvs && [uvs[0], uvs[2], uvs[3]]);
  }

  // Axis-aligned (in local frame) box from centre/size. opts: {tileU, tileV, bottom:false, roofColor, wallUV:true}
  box(cx, cy, cz, w, h, d, color, opts = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const tu = opts.tileU, tv = opts.tileV;
    const wu = (len) => (tu ? len / tu : 0);
    const wv = tv ? h / tv : 0;
    const uo = opts.uOff || 0;
    const uvq = (len, vo = 0) => (tu ? [[uo, vo], [uo + wu(len), vo], [uo + wu(len), vo + wv], [uo, vo + wv]] : undefined);
    const jitter = opts.uvOffset || 0;
    if (!opts.noSides) {
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, uvq(d, jitter));
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, uvq(d, jitter));
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, uvq(w, jitter));
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, uvq(w, jitter));
    }
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], opts.topColor ?? color);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
  }

  // Extrude a convex side profile [[z,y],...] across x in [-w/2, w/2] (centre cx,cy,cz offsets).
  prism(profile, w, color, cx = 0, cy = 0, cz = 0, opts = {}) {
    const n = profile.length;
    const xa = cx - w / 2, xb = cx + w / 2;
    let mz = 0, my = 0;
    for (const [z, y] of profile) { mz += z; my += y; }
    const hint = this.P(cx, cy + my / n, cz + mz / n);
    const L = profile.map(([z, y]) => this.P(xa, cy + y, cz + z));
    const R = profile.map(([z, y]) => this.P(xb, cy + y, cz + z));
    for (let i = 1; i < n - 1; i++) {
      this.rawTri(L[0], L[i], L[i + 1], opts.sideColor ?? color, null, hint);
      this.rawTri(R[0], R[i], R[i + 1], opts.sideColor ?? color, null, hint);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = opts.edgeColors ? opts.edgeColors[i] ?? color : color;
      this.rawTri(L[i], R[i], R[j], c, null, hint);
      this.rawTri(L[i], R[j], L[j], c, null, hint);
    }
  }

  // Cylinder along the local X axis (wheels) or Y axis (poles) when axis === 'y'.
  cylinder(cx, cy, cz, radius, length, color, axis = 'x', seg = 12, capColor) {
    const hint = this.P(cx, cy, cz);
    const ring = (s) => {
      const pts = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const c = Math.cos(a) * radius, sn = Math.sin(a) * radius;
        pts.push(axis === 'x' ? this.P(cx + s * length / 2, cy + c, cz + sn) : this.P(cx + c, cy + s * length / 2, cz + sn));
      }
      return pts;
    };
    const A = ring(-1), B = ring(1);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.rawTri(A[i], B[i], B[j], color, null, hint);
      this.rawTri(A[i], B[j], A[j], color, null, hint);
      if (i > 0 && i < seg - 1) {
        this.rawTri(A[0], A[i], A[i + 1], capColor ?? color, null, hint);
        this.rawTri(B[0], B[i], B[i + 1], capColor ?? color, null, hint);
      }
    }
  }

  // Square pyramid / gable-less hip roof.
  pyramid(cx, cy, cz, w, h, d, color) {
    const hint = this.P(cx, cy + h / 3, cz);
    const c = [cx - w / 2, cy, cz - d / 2], e = [cx + w / 2, cy, cz - d / 2], f = [cx + w / 2, cy, cz + d / 2], g = [cx - w / 2, cy, cz + d / 2];
    const top = this.P(cx, cy + h, cz);
    const P = (p) => this.P(...p);
    const corners = [P(c), P(e), P(f), P(g)];
    for (let i = 0; i < 4; i++) this.rawTri(corners[i], corners[(i + 1) % 4], top, color, null, hint);
  }

  // Low-poly rounded blob (tree crowns, bushes) from a jittered icosahedron.
  blob(cx, cy, cz, radius, color, sy = 1, detail = 1, jitter = 0.12, seed = 1) {
    const ico = new THREE.IcosahedronGeometry(radius, detail).toNonIndexed();
    const p = ico.attributes.position;
    const hint = this.P(cx, cy, cz);
    const jit = (x, y, z) => {
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
      return (s - Math.floor(s) - 0.5) * 2 * jitter * radius;
    };
    const verts = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j = jit(x, y, z);
      verts.push(this.P(cx + x + j, cy + y * sy + j * 0.5, cz + z + j));
    }
    for (let i = 0; i < verts.length; i += 3) this.rawTri(verts[i], verts[i + 1], verts[i + 2], color, null, hint);
    ico.dispose();
  }

  get triCount() {
    return this.pos.length / 9;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.tags.length) {
      if (this.tags.length < this.pos.length) this.tags.length = this.pos.length;
      g.setAttribute('tag', new THREE.Float32BufferAttribute(Float32Array.from(this.tags, (v) => v || 0), 3));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Spatial bucketing of GeoBuilders so big merged layers still frustum-cull in chunks.
export class ChunkedGeo {
  constructor(chunkSize = 270, origin = -660) {
    this.size = chunkSize;
    this.origin = origin;
    this.map = new Map();
  }

  at(x, z) {
    const k = `${Math.floor((x - this.origin) / this.size)},${Math.floor((z - this.origin) / this.size)}`;
    let gb = this.map.get(k);
    if (!gb) this.map.set(k, (gb = new GeoBuilder()));
    return gb;
  }

  // Build one mesh per non-empty chunk with the given material and add them to `parent`.
  addTo(parent, material, { cast = true, receive = true, order } = {}) {
    const out = [];
    for (const gb of this.map.values()) {
      if (!gb.triCount) continue;
      const m = new THREE.Mesh(gb.build(), material);
      m.castShadow = cast;
      m.receiveShadow = receive;
      if (order !== undefined) m.renderOrder = order;
      parent.add(m);
      out.push(m);
    }
    return out;
  }
}
