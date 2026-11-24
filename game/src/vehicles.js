// Vehicle manager: arcade driving physics, damage, fire/explosions, skidding and car-vs-world/car collisions.
import { VEHICLES } from './config.js';
import { buildVehicleModel } from './vehicleModels.js';
import { clamp, damp, rand } from './random.js';
import { groundY } from './roadnet.js';
import { clampToIsland } from './collision.js';

let nextId = 1;

export function createVehicles(G) {
  const list = [];
  const V = { list };

  V.spawn = (type, x, z, heading, opts = {}) => {
    const def = VEHICLES[type];
    const paint = opts.color ?? 0xdddddd;
    const model = buildVehicleModel(type, paint);
    G.scene.add(model.group);
    const v = {
      id: nextId++, type, def, model, x, z, y: groundY(x, z), heading, vx: 0, vz: 0, steerAngle: 0,
      input: { throttle: 0, steer: 0, handbrake: false }, driver: null, kind: opts.kind || 'civil',
      health: def.health, maxHealth: def.health, burning: false, burnTimer: 0, dead: false, pitch: 0, roll: 0,
      speed: 0, fwd: 0, lat: 0, siren: !!opts.siren, ai: null, age: 0, wheelSpin: 0, smokeT: 0, skidT: 0, hitCooldown: 0,
      lastAttacker: null, color: paint, braking: false, mission: !!opts.mission, stun: 0, hornT: 0,
    };
    if (opts.kind === 'police' || type === 'cruiser' || type === 'swat') v.siren = true;
    placeModel(v);
    list.push(v);
    return v;
  };

  V.remove = (v) => {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    G.scene.remove(v.model.group);
    v.model.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry !== undefined) {
        // geometries of wheels are shared; dispose only body/trim/light geometries
        if (o === v.model.bodyMesh || o === v.model.trimMesh) o.geometry.dispose();
      }
    });
    v.model.bodyMat.dispose();
    v.removed = true;
  };

  function placeModel(v) {
    const g = v.model.group;
    g.position.set(v.x, v.y, v.z);
    g.rotation.set(v.pitch, v.heading, v.roll, 'YXZ');
  }

  V.damage = (v, amount, attacker) => {
    if (v.dead || amount <= 0) return;
    v.health -= amount;
    if (attacker) v.lastAttacker = attacker;
    if (v.health <= 0 && !v.burning) {
      v.health = 0;
      v.burning = true;
      v.burnTimer = 2.8 + rand() * 0.8;
      G.events?.emit('vehicleBurning', v);
    }
  };

  V.explode = (v) => {
    if (v.dead) return;
    v.dead = true;
    v.burning = false;
    G.fx.explosion(v.x, 0.8, v.z, 9);
    G.audio?.explosion(v.x, v.z);
    G.combat?.explodeAt(v.x, v.z, 10, 90, v.lastAttacker, v);
    v.model.bodyMat.color.setHex(0x1a1a1a);
    v.model.bodyMat.roughness = 1;
    v.model.bodyMat.metalness = 0;
    v.model.driver.visible = false;
    v.vx *= 0.3; v.vz *= 0.3;
    v.model.group.userData.wreck = true;
    if (v.driver) G.events?.emit('driverKilled', v);
    G.events?.emit('vehicleExploded', v);
    v.wreckAge = 0;
  };

  V.nearest = (x, z, maxDist, filter) => {
    let best = null, bd = maxDist;
    for (const v of list) {
      if (filter && !filter(v)) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };

  function circles(v) {
    const r = v.def.width * 0.5 + 0.05, hl = v.def.length / 2 - r;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    return [[v.x + s * hl, v.z + c * hl, r], [v.x, v.z, r * 1.05], [v.x - s * hl, v.z - c * hl, r]];
  }
  V.circles = circles;

  function step(v, dt) {
    const def = v.def;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    let vf = v.vx * s + v.vz * c;
    let vl = v.vx * c - v.vz * s;
    const inp = v.dead ? { throttle: 0, steer: 0, handbrake: false } : v.input;
    const active = !v.dead && (v.driver !== null || inp.throttle !== 0 || v.ai);
    const maxS = def.maxSpeed;
    let thr = v.burning && v.health <= 0 ? inp.throttle * 0.6 : inp.throttle;
    if (v.stun > 0) { v.stun -= dt; thr = 0; }
    v.braking = false;
    if (thr > 0) {
      if (vf < -1) { vf += 30 * dt; v.braking = true; }
      else vf += def.accel * thr * dt * (1 - clamp(Math.abs(vf) / maxS, 0, 1) ** 2);
    } else if (thr < 0) {
      if (vf > 1) { vf -= 34 * dt; v.braking = true; }
      else vf -= def.accel * 0.55 * -thr * dt * (1 - clamp(Math.abs(vf) / (maxS * 0.35), 0, 1));
    } else {
      const drag = 2.2 + Math.abs(vf) * 0.05;
      const dv = drag * dt;
      vf = Math.abs(vf) <= dv ? 0 : vf - Math.sign(vf) * dv;
    }
    const hb = inp.handbrake;
    if (hb) { vf *= Math.exp(-1.1 * dt); v.braking = true; }
    // lateral grip: drops when sliding hard so cars drift instead of snapping straight
    let grip = def.grip * (hb ? 0.18 : 1);
    if (!hb && Math.abs(vl) > 6) grip *= 0.55;
    vl *= Math.exp(-grip * dt);
    // steering
    const maxSteer = def.steer / (1 + Math.abs(vf) / 16);
    const target = inp.steer * maxSteer;
    v.steerAngle = damp(v.steerAngle, target, 9, dt);
    const wheelBase = def.length * 0.62;
    let yaw = (vf / wheelBase) * Math.tan(v.steerAngle);
    if (hb && Math.abs(vf) > 6) yaw *= 1.45;
    yaw = clamp(yaw, -3.2, 3.2);
    v.vx = s * vf + c * vl;
    v.vz = c * vf - s * vl;
    v.heading += yaw * dt;
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.fwd = vf;
    v.lat = vl;
    v.speed = Math.hypot(v.vx, v.vz);
    v.yaw = yaw;
    void active;
  }

  function collideWorld(v, dt) {
    let impact = 0;
    const cs = circles(v);
    for (const [cx, cz, r] of cs) {
      const res = G.collision.pushCircle(cx, cz, r, 1.5);
      if (res.hit) {
        v.x += res.x - cx;
        v.z += res.z - cz;
        const vn = v.vx * res.nx + v.vz * res.nz;
        if (vn < 0) {
          v.vx -= (1.25) * vn * res.nx;
          v.vz -= (1.25) * vn * res.nz;
          v.vx *= 0.97; v.vz *= 0.97;
          impact = Math.max(impact, -vn);
          // front hits twist the nose
          const side = (cx - v.x) * res.nz - (cz - v.z) * res.nx;
          v.heading += clamp(side * -vn * 0.01, -0.12, 0.12);
        }
      }
    }
    const p = { x: v.x, z: v.z };
    if (clampToIsland(p, 2)) {
      v.x = p.x; v.z = p.z; v.vx *= 0.5; v.vz *= 0.5;
    }
    if (impact > 3.5 && v.hitCooldown <= 0) {
      v.hitCooldown = 0.25;
      const dmg = Math.max(0, impact - 4.5) * 4.2 / v.def.mass;
      V.damage(v, dmg, null);
      G.fx.spark(v.x + Math.sin(v.heading) * v.def.length * 0.4, 0.6, v.z + Math.cos(v.heading) * v.def.length * 0.4, Math.min(14, impact), 6 + impact * 0.3);
      G.audio?.crash(clamp(impact / 20, 0.15, 1), v.x, v.z);
      if (v.driver === 'player') G.fx.addShake(clamp(impact / 25, 0.05, 0.6));
      G.events?.emit('vehicleCrash', v, impact);
    }
  }

  function collidePairs(dt) {
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b];
        const dx = B.x - A.x, dz = B.z - A.z;
        const reach = (A.def.length + B.def.length) / 2 + 0.5;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const ca = circles(A), cb = circles(B);
        for (const [ax, az, ar] of ca) {
          for (const [bx, bz, br] of cb) {
            let ddx = bx - ax, ddz = bz - az;
            const d = Math.hypot(ddx, ddz), m = ar + br;
            if (d >= m || d < 1e-5) continue;
            const nx = ddx / d, nz = ddz / d, pen = m - d;
            const ma = A.def.mass, mb = B.def.mass, tot = ma + mb;
            A.x -= nx * pen * (mb / tot); A.z -= nz * pen * (mb / tot);
            B.x += nx * pen * (ma / tot); B.z += nz * pen * (ma / tot);
            const rvx = B.vx - A.vx, rvz = B.vz - A.vz;
            const vn = rvx * nx + rvz * nz;
            if (vn < 0) {
              const j = (-(1 + 0.35) * vn) / (1 / ma + 1 / mb);
              A.vx -= (j * nx) / ma; A.vz -= (j * nz) / ma;
              B.vx += (j * nx) / mb; B.vz += (j * nz) / mb;
              const imp = -vn;
              if (imp > 3 && A.hitCooldown <= 0 && B.hitCooldown <= 0) {
                A.hitCooldown = B.hitCooldown = 0.3;
                V.damage(A, Math.max(0, imp - 3) * 3.4 * (mb / ma) * 0.6, B.driver === 'player' ? 'player' : B);
                V.damage(B, Math.max(0, imp - 3) * 3.4 * (ma / mb) * 0.6, A.driver === 'player' ? 'player' : A);
                A.stun = Math.max(A.stun, imp > 8 ? 0.8 : 0);
                B.stun = Math.max(B.stun, imp > 8 ? 0.8 : 0);
                G.fx.spark((ax + bx) / 2, 0.7, (az + bz) / 2, Math.min(12, imp), 7);
                G.audio?.crash(clamp(imp / 20, 0.15, 1), ax, az);
                if (A.driver === 'player' || B.driver === 'player') G.fx.addShake(clamp(imp / 22, 0.05, 0.6));
                G.events?.emit('vehicleCollision', A, B, imp);
              }
            }
          }
        }
      }
    }
  }

  V.update = (dt) => {
    const night = G.env.night;
    const px = G.player.x, pz = G.player.z;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      v.age += dt;
      v.hitCooldown -= dt;
      const far = Math.hypot(v.x - px, v.z - pz) > 260;
      if (far && !v.mission && v.driver !== 'player') {
        // freeze distant vehicles (they are normally removed by their spawners)
        placeModel(v);
        continue;
      }
      step(v, dt);
      collideWorld(v, dt);

      // burning and wreck handling
      if (v.burning) {
        v.burnTimer -= dt;
        if (rand() < dt * 40) G.fx.fire(v.x + (rand() - 0.5), 1.0, v.z + (rand() - 0.5), 1.6);
        if (rand() < dt * 12) G.fx.smoke(v.x, 1.4, v.z, 1.6, 1.6, 0.12, 0.7);
        if (v.burnTimer <= 0) V.explode(v);
      } else if (v.dead) {
        v.wreckAge += dt;
        if (rand() < dt * 8) G.fx.smoke(v.x, 1.0, v.z, 1.6, 2, 0.15, 0.5);
        if (v.wreckAge < 25 && rand() < dt * 10) G.fx.fire(v.x + (rand() - 0.5), 0.7, v.z + (rand() - 0.5), 1.0);
      } else if (v.health < v.maxHealth * 0.35) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = 0.08;
          const s = Math.sin(v.heading), c = Math.cos(v.heading);
          G.fx.smoke(v.x + s * v.def.length * 0.35, 1.0, v.z + c * v.def.length * 0.35, 1.0, 1.6, v.health < v.maxHealth * 0.18 ? 0.1 : 0.4, 0.55);
        }
      }

      // skid marks, tire smoke, squeal
      const slip = Math.abs(v.lat);
      const sliding = !v.dead && v.speed > 4 && (slip > 3.4 || (v.input.handbrake && v.speed > 8));
      v.sliding = sliding;
      if (sliding) {
        v.skidT -= dt;
        if (v.skidT <= 0) {
          v.skidT = 0.045;
          const s = Math.sin(v.heading), c = Math.cos(v.heading);
          const rx = c * (v.def.width / 2 - 0.15), rz = -s * (v.def.width / 2 - 0.15);
          const bx = v.x - s * v.def.length * 0.31, bz = v.z - c * v.def.length * 0.31;
          const hd = Math.atan2(v.vx, v.vz);
          G.fx.skid(bx + rx, bz + rz, hd, v.speed);
          G.fx.skid(bx - rx, bz - rz, hd, v.speed);
          G.fx.tireSmoke(bx + rx, bz + rz);
          if (rand() < 0.5) G.fx.tireSmoke(bx - rx, bz - rz);
        }
      }

      // visual pose
      const ay = groundY(v.x, v.z);
      v.y = damp(v.y, ay, 14, dt);
      const accel = v.fwd - (v.prevFwd ?? v.fwd);
      v.prevFwd = v.fwd;
      const targetPitch = clamp(accel * 0.04 / Math.max(dt, 0.001) * 0.04, -0.06, 0.06);
      v.pitch = damp(v.pitch, v.dead ? 0.02 : -targetPitch, 6, dt);
      v.roll = damp(v.roll, v.dead ? 0.04 : clamp(-(v.yaw || 0) * v.fwd * 0.0045, -0.09, 0.09), 6, dt);
      placeModel(v);

      const m = v.model;
      v.wheelSpin += (v.fwd * dt) / m.wheelRadius;
      for (const w of m.wheels) {
        w.mesh.rotation.x = v.wheelSpin;
        if (w.front) w.pivot.rotation.y = v.steerAngle * 1.1;
      }
      m.driver.visible = v.driver !== null && !v.dead;
      m.headMat.color.setScalar(0.45 + 0.55 * night);
      m.tailMat.color.setScalar(v.braking ? 1.4 : 0.35 + 0.4 * night);
      if (m.bar) {
        const on = v.siren && !v.dead && v.sirenOn !== false;
        const ph = Math.floor(G.time * 7) % 2;
        m.bar.redMat.color.setHex(on && ph ? 0xff2020 : 0x3a0808);
        m.bar.blueMat.color.setHex(on && !ph ? 0x2a60ff : 0x0a1030);
      }
    }
    collidePairs(dt);
  };

  return V;
}

