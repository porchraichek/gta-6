// Small combat-only visuals: muzzle flash stars, ejected shell casings, bloodless hit puffs and the throw-arc preview.
// Built on pooled meshes so firing never allocates; general particles still go through G.fx.
import * as THREE from 'three';

const MAX_CASINGS = 40;
const MAX_FLASHES = 6;
const ARC_POINTS = 34;

export function createCombatFx(G) {
  const scene = G.scene;
  const F = {};

  // ---- muzzle flash: three crossed additive quads, stretched along the barrel
  const flashGeo = new THREE.BufferGeometry();
  {
    const v = [];
    // quad spanning z=0..1 with half-width vector (ax, ay)
    const quad = (ax, ay) => v.push(-ax, -ay, 0, ax, ay, 0, ax, ay, 1, -ax, -ay, 0, ax, ay, 1, -ax, -ay, 1);
    quad(0.5, 0);
    quad(0, 0.5);
    quad(0.35, 0.35);
    flashGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  }
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const flashes = [];
  for (let i = 0; i < MAX_FLASHES; i++) {
    const m = new THREE.Mesh(flashGeo, flashMat);
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    flashes.push({ mesh: m, t: 0 });
  }
  let flashHead = 0;
  const tmpV = new THREE.Vector3();
  F.muzzleFlash = (x, y, z, dx, dy, dz, size = 1) => {
    const f = flashes[flashHead++ % MAX_FLASHES];
    f.t = 0.05;
    f.mesh.visible = true;
    f.mesh.position.set(x, y, z);
    tmpV.set(x + dx, y + dy, z + dz);
    f.mesh.lookAt(tmpV);
    f.mesh.rotateZ(Math.random() * 3);
    const s = (0.22 + Math.random() * 0.12) * size;
    f.mesh.scale.set(s, s, s * (2.2 + Math.random()));
    G.fx.muzzle(x, y, z, dx, dz);
  };

  // ---- shell casings: one instanced mesh, simple bounce physics
  const casingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 0.8, roughness: 0.35 }), MAX_CASINGS);
  casingMesh.frustumCulled = false;
  casingMesh.count = MAX_CASINGS;
  scene.add(casingMesh);
  const cas = [];
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_CASINGS; i++) { cas.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, t: 0, floor: 0 }); casingMesh.setMatrixAt(i, hidden); }
  let casHead = 0, casActive = 0;
  F.casing = (x, y, z, heading, shotgun = false) => {
    const c = cas[casHead++ % MAX_CASINGS];
    const rx = -Math.cos(heading), rz = Math.sin(heading); // to the shooter's right
    const sp = 2 + Math.random() * 1.5;
    Object.assign(c, { x, y, z, vx: rx * sp + (Math.random() - 0.5), vy: 2.5 + Math.random() * 1.5, vz: rz * sp + (Math.random() - 0.5), rx: 0, ry: 0, t: 1.6, floor: G.actors.supportHeight(x, z, y) + 0.015 });
    if (shotgun) c.vy += 1;
    casActive = 1.7;
  };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();

  // ---- throw arc preview: dashed line of predicted flight
  const arcPos = new Float32Array(ARC_POINTS * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arc = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0xfff1a8, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85, toneMapped: false, depthTest: false }));
  arc.frustumCulled = false;
  arc.visible = false;
  arc.renderOrder = 9;
  scene.add(arc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  // points: array of [x,y,z] samples, radius: blast radius shown at the landing point
  F.showArc = (points, radius) => {
    const n = Math.min(points.length, ARC_POINTS);
    for (let i = 0; i < ARC_POINTS; i++) {
      const s = points[Math.min(i, n - 1)];
      arcPos[i * 3] = s[0]; arcPos[i * 3 + 1] = s[1]; arcPos[i * 3 + 2] = s[2];
    }
    arcGeo.attributes.position.needsUpdate = true;
    arc.computeLineDistances();
    arc.visible = true;
    const end = points[n - 1];
    ring.position.set(end[0], end[1] + 0.08, end[2]);
    ring.scale.setScalar(radius);
    ring.visible = true;
  };
  F.hideArc = () => { arc.visible = false; ring.visible = false; };

  // ---- bloodless hit feedback: a pale dust puff plus a couple of sparks
  F.hitPuff = (x, y, z, heavy = false) => {
    G.fx.impact(x, y, z, [0.92, 0.9, 0.86]);
    if (heavy) G.fx.dust(x, y, z, 3);
  };
  F.meleePuff = (x, y, z) => {
    G.fx.spark(x, y, z, 5, 3);
    G.fx.dust(x, y, z, 2);
  };

  F.update = (dt) => {
    for (const f of flashes) {
      if (f.t <= 0) continue;
      f.t -= dt;
      if (f.t <= 0) f.mesh.visible = false;
    }
    if (casActive > 0) {
      casActive -= dt;
      for (let i = 0; i < MAX_CASINGS; i++) {
        const c = cas[i];
        if (c.t <= 0) continue;
        c.t -= dt;
        c.vy -= 20 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += dt * 18; c.ry += dt * 11;
        if (c.y < c.floor) { c.y = c.floor; c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; c.rx *= 0.5; }
        if (c.t <= 0) { casingMesh.setMatrixAt(i, hidden); continue; }
        e.set(c.rx, c.ry, 0);
        q.setFromEuler(e);
        mtx.compose(p.set(c.x, c.y, c.z), q, one);
        casingMesh.setMatrixAt(i, mtx);
      }
      casingMesh.instanceMatrix.needsUpdate = true;
    }
  };

  return F;
}
