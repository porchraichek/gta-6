// Visual effects: GPU-point particles (smoke, fire, sparks), explosions, tracers, skid marks and screen shake.
import * as THREE from 'three';
import { rand } from './random.js';

const P_VERT = `
attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`;
const P_FRAG = `
varying vec4 vColor;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = (1.0 - smoothstep(0.18, 0.5, d)) * vColor.a; if(a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }`;

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: 800 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 4] = r; this.c0[i * 4 + 1] = g; this.c0[i * 4 + 2] = b; this.c0[i * 4 + 3] = a;
    this.grav[i] = grav; this.drag[i] = drag;
    this.size[i] = s0;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.col[i * 4 + 3] !== 0) this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(this.life[i], 0) / this.maxLife[i];
      const k = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.c0[i * 4]; this.col[i * 4 + 1] = this.c0[i * 4 + 1]; this.col[i * 4 + 2] = this.c0[i * 4 + 2];
      this.col[i * 4 + 3] = this.c0[i * 4 + 3] * (1 - t) * (t < 0.1 ? t * 10 : 1);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}

export function createEffects(scene) {
  const smokeSys = new ParticleSystem(scene, 900, false);
  const glowSys = new ParticleSystem(scene, 900, true);
  const fx = { shake: 0, flash: 0 };

  // shared flash light for explosions and muzzle
  const flashLight = new THREE.PointLight(0xffa550, 0, 60, 2);
  scene.add(flashLight);

  // shockwave ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringT = 0;

  // decals: skid marks and scorch, ring buffer of quads
  const MAXD = 1400;
  const dpos = new Float32Array(MAXD * 18);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setDrawRange(0, 0);
  const decals = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  decals.frustumCulled = false;
  decals.renderOrder = 2;
  scene.add(decals);
  let dHead = 0, dCount = 0;
  fx.decal = (x, z, heading, w, len, y = 0.07) => {
    const s = Math.sin(heading), c = Math.cos(heading);
    const fx0 = s * len / 2, fz0 = c * len / 2, rx = c * w / 2, rz = -s * w / 2;
    const p = [
      [x - fx0 - rx, z - fz0 - rz], [x + fx0 - rx, z + fz0 - rz], [x + fx0 + rx, z + fz0 + rz],
      [x - fx0 - rx, z - fz0 - rz], [x + fx0 + rx, z + fz0 + rz], [x - fx0 + rx, z - fz0 + rz],
    ];
    let o = dHead * 18;
    for (const [px, pz] of p) { dpos[o++] = px; dpos[o++] = y; dpos[o++] = pz; }
    dHead = (dHead + 1) % MAXD;
    dCount = Math.min(MAXD, dCount + 1);
    dgeo.setDrawRange(0, dCount * 6);
    dgeo.attributes.position.needsUpdate = true;
  };
  fx.skid = (x, z, heading, speed) => fx.decal(x, z, heading, 0.26, Math.max(0.6, Math.min(2.2, speed * 0.05)));

  // tracers
  const MAXT = 48;
  const tpos = new Float32Array(MAXT * 6);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  const tlife = new Float32Array(MAXT);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, toneMapped: false });
  const tracers = new THREE.LineSegments(tgeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  let tHead = 0;
  fx.tracer = (ax, ay, az, bx, by, bz) => {
    const i = tHead++ % MAXT;
    tpos.set([ax, ay, az, bx, by, bz], i * 6);
    tlife[i] = 0.07;
  };

  fx.smoke = (x, y, z, size = 1.2, life = 1.4, shade = 0.55, a = 0.5) => {
    smokeSys.emit(x, y, z, (rand() - 0.5) * 0.8, 1.2 + rand() * 0.8, (rand() - 0.5) * 0.8, life, size * 0.5, size * 2.4, shade, shade, shade, a, -0.2, 0.4);
  };
  fx.tireSmoke = (x, z) => {
    smokeSys.emit(x, 0.2, z, (rand() - 0.5) * 1.2, 0.6, (rand() - 0.5) * 1.2, 0.9, 0.5, 2.2, 0.85, 0.85, 0.85, 0.35, 0, 0.5);
  };
  fx.dust = (x, y, z, n = 4) => {
    for (let i = 0; i < n; i++) smokeSys.emit(x + (rand() - 0.5), y, z + (rand() - 0.5), (rand() - 0.5) * 2, 0.8, (rand() - 0.5) * 2, 0.8, 0.6, 1.8, 0.78, 0.7, 0.58, 0.4, 0, 1);
  };
  fx.spark = (x, y, z, n = 8, speed = 8) => {
    for (let i = 0; i < n; i++) {
      glowSys.emit(x, y, z, (rand() - 0.5) * speed, rand() * speed * 0.7, (rand() - 0.5) * speed, 0.35 + rand() * 0.3, 0.18, 0.05, 1, 0.75 + rand() * 0.2, 0.3, 1, 18, 0.5);
    }
  };
  fx.fire = (x, y, z, size = 1.4) => {
    glowSys.emit(x + (rand() - 0.5) * 0.6, y, z + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.8, 2.2 + rand() * 1.5, (rand() - 0.5) * 0.8, 0.55, size, size * 0.2, 1, 0.45 + rand() * 0.3, 0.1, 0.75, -1.5, 0.5);
  };
  fx.muzzle = (x, y, z, dx, dz) => {
    glowSys.emit(x, y, z, dx * 3, 0, dz * 3, 0.07, 0.7, 0.9, 1, 0.85, 0.4, 1, 0, 0);
    flashLight.position.set(x, y, z);
    flashLight.color.setHex(0xffd080);
    flashLight.intensity = 6;
    fx.flash = Math.max(fx.flash, 0.06);
  };
  fx.impact = (x, y, z, color = [0.9, 0.85, 0.7]) => {
    fx.spark(x, y, z, 4, 5);
    smokeSys.emit(x, y, z, 0, 0.5, 0, 0.5, 0.2, 0.8, color[0], color[1], color[2], 0.4, 0, 1);
  };
  fx.explosion = (x, y, z, radius = 8) => {
    for (let i = 0; i < 46; i++) {
      const a = rand() * 6.28, e = rand() * 1.4, s = (4 + rand() * 9) * (radius / 8);
      glowSys.emit(x, y + 0.5, z, Math.cos(a) * s * Math.cos(e) * 0.5, Math.sin(e) * s * 0.9 + 2, Math.sin(a) * s * Math.cos(e) * 0.5, 0.5 + rand() * 0.7, 3 + rand() * 2, 0.5, 1, 0.5 + rand() * 0.35, 0.12, 0.9, 2, 1.2);
    }
    for (let i = 0; i < 38; i++) {
      const a = rand() * 6.28, s = 2 + rand() * 7;
      smokeSys.emit(x, y + 1, z, Math.cos(a) * s * 0.4, 2 + rand() * 6, Math.sin(a) * s * 0.4, 1.5 + rand() * 2.2, 2.5, 8 + rand() * 4, 0.16, 0.15, 0.15, 0.7, -0.3, 0.6);
    }
    fx.spark(x, y + 1, z, 30, 16);
    flashLight.position.set(x, y + 3, z);
    flashLight.color.setHex(0xff9a40);
    flashLight.intensity = 90;
    fx.flash = 0.45;
    fx.shake = Math.max(fx.shake, 1.0);
    ring.position.set(x, 0.3, z);
    ring.visible = true;
    ring.userData.r = radius;
    ringT = 0.001;
    fx.decal(x, z, rand() * 6, radius * 0.9, radius * 0.9, 0.065);
  };
  fx.update = (dt, scale) => {
    smokeSys.uniforms.uScale.value = scale;
    glowSys.uniforms.uScale.value = scale;
    smokeSys.update(dt);
    glowSys.update(dt);
    fx.shake = Math.max(0, fx.shake - dt * 2.4);
    if (fx.flash > 0) {
      fx.flash -= dt;
      flashLight.intensity *= Math.exp(-dt * 9);
      if (fx.flash <= 0) flashLight.intensity = 0;
    }
    if (ringT > 0) {
      ringT += dt;
      const t = ringT / 0.5;
      ring.scale.setScalar(1 + t * ring.userData.r * 1.4);
      ring.material.opacity = Math.max(0, 0.7 * (1 - t));
      if (t >= 1) { ring.visible = false; ringT = 0; }
    }
    let any = false;
    for (let i = 0; i < MAXT; i++) {
      if (tlife[i] > 0) {
        tlife[i] -= dt;
        any = true;
        if (tlife[i] <= 0) tpos.fill(0, i * 6, i * 6 + 6);
      }
    }
    if (any) tgeo.attributes.position.needsUpdate = true;
  };
  fx.addShake = (v) => {
    fx.shake = Math.min(1.4, fx.shake + v);
  };
  return fx;
}
