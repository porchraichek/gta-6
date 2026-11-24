// Dogs walked on a leash by pedestrians: small low-poly quadrupeds that trot beside their owner and bolt with them.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { rand, damp, angleDiff, clamp } from './random.js';
import { groundY } from './roadnet.js';

const COATS = [[0x7a4a26, 0xf2e6d0], [0x1c1a18, 0x3a3430], [0xe8e2d6, 0xc9bfae], [0xc8923e, 0xf1d9a8], [0x8d8f94, 0x5c5e63]];
const MAX_DOGS = 7;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const leashMat = new THREE.LineBasicMaterial({ color: 0x2a1c14 });
const geoCache = new Map();

function dogGeometries(coat, accent) {
  const key = `${coat}|${accent}`;
  let g = geoCache.get(key);
  if (g) return g;
  const body = new GeoBuilder();
  body.box(0, 0.42, 0, 0.24, 0.24, 0.62, coat);
  body.box(0, 0.38, 0.12, 0.2, 0.16, 0.3, accent);
  body.box(0, 0.6, 0.36, 0.2, 0.2, 0.22, coat); // head
  body.box(0, 0.55, 0.5, 0.12, 0.1, 0.14, accent); // snout
  body.box(0, 0.58, 0.575, 0.05, 0.04, 0.02, 0x111111); // nose
  for (const sx of [-1, 1]) body.box(sx * 0.07, 0.73, 0.33, 0.05, 0.08, 0.05, coat); // ears
  body.box(0, 0.5, 0.29, 0.22, 0.04, 0.06, 0xd0342c); // collar
  const leg = new GeoBuilder();
  leg.box(0, -0.15, 0, 0.07, 0.3, 0.07, coat);
  const tail = new GeoBuilder();
  tail.box(0, 0.12, -0.02, 0.05, 0.24, 0.05, coat);
  g = { body: body.build(), leg: leg.build(), tail: tail.build() };
  geoCache.set(key, g);
  return g;
}

export function createDogs(G) {
  const list = [];
  const D = { list };

  function build(scale) {
    const [coat, accent] = COATS[Math.floor(rand() * COATS.length)];
    const geo = dogGeometries(coat, accent);
    const group = new THREE.Group();
    const body = new THREE.Mesh(geo.body, mat);
    body.castShadow = true;
    group.add(body);
    const legs = [];
    for (const [x, z] of [[0.08, 0.22], [-0.08, 0.22], [0.08, -0.22], [-0.08, -0.22]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.32, z);
      pivot.add(new THREE.Mesh(geo.leg, mat));
      group.add(pivot);
      legs.push(pivot);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -0.31);
    tail.rotation.x = -0.6;
    tail.add(new THREE.Mesh(geo.tail, mat));
    group.add(tail);
    group.scale.setScalar(scale);
    return { group, legs, tail };
  }

  D.canAdd = () => list.length < MAX_DOGS;

  // Give a pedestrian a dog on a leash.
  D.attach = (owner) => {
    if (!D.canAdd()) return null;
    const model = build(0.75 + rand() * 0.55);
    const leashGeo = new THREE.BufferGeometry();
    leashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const leash = new THREE.Line(leashGeo, leashMat);
    leash.frustumCulled = false;
    G.scene.add(model.group, leash);
    const dog = { owner, model, leash, x: owner.x + 0.8, z: owner.z, heading: owner.heading, speed: 0, phase: rand() * 6, side: rand() < 0.5 ? 1 : -1, loose: 0, sniffT: 0 };
    owner.dog = dog;
    list.push(dog);
    return dog;
  };

  function remove(dog) {
    G.scene.remove(dog.model.group, dog.leash);
    dog.leash.geometry.dispose();
    if (dog.owner?.dog === dog) dog.owner.dog = null;
    list.splice(list.indexOf(dog), 1);
  }

  D.update = (dt) => {
    const px = G.player.x, pz = G.player.z;
    for (let i = list.length - 1; i >= 0; i--) {
      const dog = list[i];
      const o = dog.owner;
      const ownerGone = !o || o.removed || o.dead || o.inVehicle;
      if (ownerGone) dog.loose += dt;
      if (dog.loose > 8 || Math.hypot(dog.x - px, dog.z - pz) > 220) { remove(dog); continue; }
      let tx, tz, maxSpeed;
      if (ownerGone) {
        // runs off in a straight line
        tx = dog.x + Math.sin(dog.heading) * 5; tz = dog.z + Math.cos(dog.heading) * 5;
        maxSpeed = 7;
      } else {
        // trot at heel, a little ahead and to one side; stop to sniff when the owner idles
        const oh = o.speed > 0.3 ? Math.atan2(o.vx, o.vz) : o.heading;
        tx = o.x + Math.sin(oh) * 0.7 + Math.cos(oh) * 0.7 * dog.side;
        tz = o.z + Math.cos(oh) * 0.7 - Math.sin(oh) * 0.7 * dog.side;
        maxSpeed = Math.max(2.5, o.speed * 1.4 + 1);
      }
      const dx = tx - dog.x, dz = tz - dog.z, d = Math.hypot(dx, dz);
      const want = d > 0.25 ? Math.min(maxSpeed, d * 3) : 0;
      dog.speed = damp(dog.speed, want, 8, dt);
      if (d > 0.05) dog.heading += angleDiff(dog.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
      dog.x += Math.sin(dog.heading) * dog.speed * dt;
      dog.z += Math.cos(dog.heading) * dog.speed * dt;
      // the leash never stretches past 2.2 m
      if (!ownerGone) {
        const lx = dog.x - o.x, lz = dog.z - o.z, ll = Math.hypot(lx, lz);
        if (ll > 2.2) { dog.x = o.x + (lx / ll) * 2.2; dog.z = o.z + (lz / ll) * 2.2; }
      }
      const res = G.collision.pushCircle(dog.x, dog.z, 0.25);
      if (res.hit) { dog.x = res.x; dog.z = res.z; }

      const m = dog.model;
      const y = groundY(dog.x, dog.z);
      dog.phase += dog.speed * dt * 6;
      const sw = Math.sin(dog.phase) * clamp(dog.speed / 2, 0, 1) * 0.7;
      m.legs[0].rotation.x = sw; m.legs[3].rotation.x = sw;
      m.legs[1].rotation.x = -sw; m.legs[2].rotation.x = -sw;
      m.tail.rotation.z = Math.sin(G.time * (dog.speed > 3 ? 4 : 12)) * 0.5;
      m.group.position.set(dog.x, y + Math.abs(Math.sin(dog.phase)) * 0.03 * clamp(dog.speed, 0, 1), dog.z);
      m.group.rotation.y = dog.heading;

      const p = dog.leash.geometry.attributes.position;
      dog.leash.visible = !ownerGone;
      if (!ownerGone) {
        const hs = Math.sin(o.heading), hc = Math.cos(o.heading);
        p.setXYZ(0, o.x + hc * 0.3 * dog.side + hs * 0.1, o.y + 0.95, o.z - hs * 0.3 * dog.side + hc * 0.1);
        p.setXYZ(1, dog.x + Math.sin(dog.heading) * 0.28 * m.group.scale.x, y + 0.48 * m.group.scale.x, dog.z + Math.cos(dog.heading) * 0.28 * m.group.scale.x);
        p.needsUpdate = true;
      }
    }
  };

  return D;
}
