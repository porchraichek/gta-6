// Vehicle manager: arcade driving physics with weight transfer, drifts, burnouts and nitro; motorcycles and boats;
// damage (dents, broken lamps, bent wheels, smoke, fire, explosions); car-vs-world and car-vs-car collisions with spin-outs.
import './vehicleDefs.js';
import { VEHICLES } from './config.js';
import { buildVehicleModel, disposeVehicleModel } from './vehicleModels.js';
import { applyImpactDamage, scorchModel } from './vehicleDamage.js';
import { clamp, damp, rand } from './random.js';
import { groundY } from './roadnet.js';
import { clampToIsland } from './collision.js';
import { SEA_Y, keepBoatAtSea, seabedY, swell } from './water.js';

let nextId = 1;
const NO_INPUT = { throttle: 0, steer: 0, handbrake: false };
const NITRO_SECONDS = 3.5; // full tank duration
const NITRO_REFILL = 14; // seconds to refill from empty

export function createVehicles(G) {
  const list = [];
  const V = { list };

  V.spawn = (type, x, z, heading, opts = {}) => {
    const def = VEHICLES[type] || VEHICLES.sedan;
    const paint = opts.color ?? 0xdddddd;
    const model = buildVehicleModel(type, paint);
    G.scene.add(model.group);
    const boat = def.kind === 'boat';
    const v = {
      id: nextId++, type, def, model, x, z, y: boat ? SEA_Y : groundY(x, z), heading, vx: 0, vz: 0, steerAngle: 0, angVel: 0,
      input: { throttle: 0, steer: 0, handbrake: false }, driver: null, kind: opts.kind || 'civil',
      health: def.health, maxHealth: def.health, burning: false, burnTimer: 0, dead: false, pitch: 0, roll: 0,
      speed: 0, fwd: 0, lat: 0, yaw: 0, siren: !!opts.siren, ai: null, age: 0, wheelSpin: 0, rearSpin: 0, smokeT: 0, skidT: 0, hitCooldown: 0,
      lastAttacker: null, color: paint, braking: false, reversing: false, mission: !!opts.mission, stun: 0, hornT: 0,
      nitro: def.nitro ? 1 : 0, boosting: false, burnout: 0, launchT: 0, load: 0, spinT: 0, pull: 0, lean: 0, wheelie: 0,
      scrapeT: 0, fxT: 0, circ: [], dents: 0,
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
    disposeVehicleModel(v.model);
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
    scorchModel(v);
    v.model.driver.visible = false;
    v.vx *= 0.3; v.vz *= 0.3;
    v.angVel += (rand() - 0.5) * 3;
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

  // Collision footprint: a row of circles along the body (more for long vehicles). Reuses v.circ arrays.
  function circles(v) {
    const r = v.def.width * 0.5 + 0.05;
    const span = Math.max(0, v.def.length / 2 - r);
    const n = Math.max(3, Math.ceil((span * 2) / (r * 1.3)) + 1);
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const out = v.circ;
    out.length = n;
    for (let k = 0; k < n; k++) {
      const t = span - (2 * span * k) / (n - 1);
      const e = out[k] || (out[k] = [0, 0, 0]);
      e[0] = v.x + s * t; e[1] = v.z + c * t; e[2] = k === (n >> 1) ? r * 1.05 : r;
    }
    return out;
  }
  V.circles = circles;

  // ---------------------------------------------------------------- physics
  function step(v, dt) {
    const def = v.def;
    const bike = def.kind === 'bike', boat = def.kind === 'boat';
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    let vf = v.vx * s + v.vz * c;
    let vl = v.vx * c - v.vz * s;
    const inp = v.dead ? NO_INPUT : v.input;
    const hpFrac = clamp(v.health / v.maxHealth, 0, 1);
    const power = v.dead ? 0 : 0.62 + 0.38 * Math.min(1, hpFrac * 2.2);
    let thr = inp.throttle * (v.burning ? 0.6 : 1);
    if (v.stun > 0) { v.stun -= dt; thr = 0; }
    const hb = !!inp.handbrake;

    // nitro: player-only, Shift while on the throttle
    v.boosting = false;
    if (def.nitro) {
      if (v.driver === 'player' && thr > 0 && G.input.down('ShiftLeft') && v.nitro > 0.02) {
        v.boosting = true;
        v.nitro = Math.max(0, v.nitro - dt / NITRO_SECONDS);
      } else v.nitro = Math.min(1, v.nitro + dt / NITRO_REFILL);
    }
    const boost = v.boosting ? 1 : 0;
    const maxS = def.maxSpeed * (1 + 0.28 * boost) * (0.78 + 0.22 * hpFrac);
    if (v.launchT > 0) v.launchT -= dt;
    const accel = def.accel * power * (1 + 0.8 * boost) * (v.launchT > 0 ? 1.55 : 1);

    // burnout: throttle + handbrake from near standstill spins the driven wheels in place (steer for donuts)
    const burning = !boat && !v.dead && thr > 0.5 && hb && Math.abs(vf) < 5;
    if (burning) v.burnout += dt;
    else {
      if (v.burnout > 0.6 && thr > 0.5) v.launchT = 1.0; // dump the clutch: launch
      v.burnout = 0;
    }

    v.braking = false;
    v.reversing = false;
    const vf0 = vf;
    if (burning) {
      vf = damp(vf, 1.2, 2, dt);
    } else if (thr > 0) {
      if (vf < -1) { vf += def.brake * dt; v.braking = true; }
      else vf += accel * thr * dt * (1 - clamp(Math.abs(vf) / maxS, 0, 1) ** 2);
    } else if (thr < 0) {
      if (vf > 1) { vf -= def.brake * Math.max(0.6, -thr) * dt; v.braking = true; }
      else {
        vf -= def.accel * 0.55 * -thr * dt * (1 - clamp(Math.abs(vf) / (maxS * 0.35), 0, 1));
        v.reversing = vf < -0.5;
      }
    } else {
      const drag = (boat ? 3.5 : 2.2) + Math.abs(vf) * (boat ? 0.09 : 0.05);
      const dv = drag * dt;
      vf = Math.abs(vf) <= dv ? 0 : vf - Math.sign(vf) * dv;
    }
    if (vf > maxS) vf = damp(vf, maxS, 1.2, dt);
    if (hb && !burning) { vf *= Math.exp(-(boat ? 0.5 : 1.1) * dt); v.braking = true; }

    // weight transfer: + when braking (load on the nose), - when accelerating (load on the rear)
    const aLong = dt > 0 ? (vf - vf0) / dt : 0;
    v.load = damp(v.load, clamp(-aLong / 24, -0.6, 0.6), 7, dt);

    // steering geometry
    const steerIn = clamp(inp.steer + (v.dead ? 0 : v.pull), -1, 1);
    const speedSteer = 1 / (1 + Math.abs(vf) / (boat ? 28 : bike ? 20 : 16));
    v.steerAngle = damp(v.steerAngle, steerIn * def.steer * speedSteer, bike ? 12 : 9, dt);
    const wheelBase = def.length * 0.62;
    let yawTarget = (vf / wheelBase) * Math.tan(v.steerAngle) * (boat ? 0.65 : 1);

    // tyre grip: handbrake and lift-off/braking lighten the rear, throttle on a RWD car keeps a slide alive
    const slip = Math.abs(vl);
    let rearGrip = hb ? (boat ? 0.6 : 0.16) : 1;
    rearGrip *= clamp(1 - v.load * 1.1 * def.drift, 0.4, 1.3);
    if (!boat && def.drive !== 'fwd' && thr > 0.3 && slip > 2) rearGrip *= 1 - 0.45 * def.drift * thr;
    if (burning) rearGrip *= 0.4;
    const sliding = !boat && (slip > 2.2 + def.grip * 0.35 || v.spinT > 0);
    const grip = def.grip * (sliding ? 0.48 + 0.22 * (1 - def.drift) : 1) * rearGrip * (v.burning ? 0.8 : 1);
    vl *= Math.exp(-grip * dt);

    // yaw: with grip the body follows the steering geometry; sliding gives it momentum and the slide self-aligns
    if (hb && Math.abs(vf) > 6 && !boat) yawTarget *= 1.5;
    if (burning) yawTarget = steerIn * (bike ? 1.4 : def.drive === 'fwd' ? 0.9 : 2.4);
    const follow = v.spinT > 0 ? 0.9 : sliding ? 3.0 + 2.5 * (1 - def.drift) : boat ? 2.6 : 12;
    v.angVel += (yawTarget - v.angVel) * (1 - Math.exp(-follow * dt));
    if (sliding && vf > 3 && !burning) v.angVel += Math.atan2(vl, vf + 1) * 2.4 * rearGrip * dt;
    v.spinT -= dt;
    const maxYaw = bike ? 3 : 4.5;
    v.angVel = clamp(v.angVel, -maxYaw, maxYaw);

    v.vx = s * vf + c * vl;
    v.vz = c * vf - s * vl;
    v.heading += v.angVel * dt;
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.fwd = vf;
    v.lat = vl;
    v.speed = Math.hypot(v.vx, v.vz);
    v.yaw = v.angVel;
    v.slipping = sliding;
    v.burningOut = burning;
  }

  // Angular kick from an impulse (jx, jz) applied at world point (px, pz).
  function spinKick(v, px, pz, jx, jz, k) {
    const rx = px - v.x, rz = pz - v.z;
    const inertia = v.def.mass * (v.def.length ** 2 + v.def.width ** 2) / 12;
    v.angVel += ((rz * jx - rx * jz) / inertia) * k;
  }

  function crashFeedback(v, impact, x, z) {
    G.fx.spark(x, 0.6, z, Math.min(14, impact), 6 + impact * 0.3);
    G.audio?.crash(clamp(impact / 20, 0.15, 1), x, z);
    if (impact > 14) G.fx.dust(x, 0.4, z, 3);
    if (v.driver === 'player') G.fx.addShake(clamp(impact / 25, 0.05, 0.6));
  }

  function collideWorld(v, dt) {
    if (v.def.kind === 'boat') {
      if (keepBoatAtSea(v)) { v.vx *= 0.4; v.vz *= 0.4; }
      return;
    }
    let impact = 0, hitX = 0, hitZ = 0, hitNX = 0, hitNZ = 0;
    const cs = circles(v);
    for (let k = 0; k < cs.length; k++) {
      const [cx, cz, r] = cs[k];
      const res = G.collision.pushCircle(cx, cz, r, 1.5);
      if (!res.hit) continue;
      v.x += res.x - cx;
      v.z += res.z - cz;
      const vn = v.vx * res.nx + v.vz * res.nz;
      if (vn < 0) {
        const px = cx - res.nx * r, pz = cz - res.nz * r;
        v.vx -= 1.25 * vn * res.nx;
        v.vz -= 1.25 * vn * res.nz;
        v.vx *= 0.97; v.vz *= 0.97;
        // off-centre wall hits twist the car
        spinKick(v, px, pz, -1.25 * vn * res.nx * v.def.mass, -1.25 * vn * res.nz * v.def.mass, 0.3);
        if (-vn > impact) { impact = -vn; hitX = px; hitZ = pz; hitNX = res.nx; hitNZ = res.nz; }
      }
      // scraping along a wall throws sparks
      const tang = Math.abs(v.vx * res.nz - v.vz * res.nx);
      if (tang > 7 && (v.scrapeT -= dt) <= 0) {
        v.scrapeT = 0.05;
        G.fx.spark(cx - res.nx * r, 0.5, cz - res.nz * r, 3, 5);
        if (rand() < 0.1) V.damage(v, 0.6, null);
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
      applyImpactDamage(v, hitX, hitZ, hitNX, hitNZ, clamp((impact - 4) / 18, 0, 1));
      if (impact > 9) v.spinT = Math.max(v.spinT, clamp(impact / 40, 0.15, 0.6));
      crashFeedback(v, impact, hitX, hitZ);
      if (v.def.kind === 'bike' && impact > 11) throwRider(v, impact);
      G.events?.emit('vehicleCrash', v, impact);
    }
  }

  // A hard motorcycle crash throws the rider off.
  function throwRider(v, impact) {
    if (v.dead || !v.driver) return;
    const kx = v.vx * 0.6, kz = v.vz * 0.6;
    if (v.driver === 'player') {
      const P = G.player;
      P.exitVehicle(true);
      const a = P.actor;
      a.vy = 4.5; a.grounded = false;
      P.takeDamage(Math.min(45, impact * 1.6), null, { dirX: kx, dirZ: kz });
    } else if (G.pedestrians?.spawnAt) {
      const a = G.pedestrians.spawnAt(v.x, v.z);
      a.vy = 4; a.grounded = false;
      G.actors.damage(a, Math.min(55, impact * 2.5), v.lastAttacker, { dirX: kx, dirZ: kz, knock: 1 });
      if (!a.dead) a.ai = { type: 'flee', t: 8, fx: v.x, fz: v.z };
      v.driver = null;
      v.ai = null;
      v.input.throttle = 0;
    }
  }

  function collidePairs() {
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b];
        if ((A.ghost && B.driver !== 'player') || (B.ghost && A.driver !== 'player')) continue;
        const dx = B.x - A.x, dz = B.z - A.z;
        const reach = (A.def.length + B.def.length) / 2 + 0.5;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const ca = circles(A), cb = circles(B);
        const ma = A.def.mass, mb = B.def.mass, tot = ma + mb;
        for (const [ax, az, ar] of ca) {
          for (const [bx, bz, br] of cb) {
            const ddx = bx - ax, ddz = bz - az;
            const d = Math.hypot(ddx, ddz), m = ar + br;
            if (d >= m || d < 1e-5) continue;
            const nx = ddx / d, nz = ddz / d, pen = m - d;
            A.x -= nx * pen * (mb / tot); A.z -= nz * pen * (mb / tot);
            B.x += nx * pen * (ma / tot); B.z += nz * pen * (ma / tot);
            const rvx = B.vx - A.vx, rvz = B.vz - A.vz;
            const vn = rvx * nx + rvz * nz;
            if (vn >= 0) continue;
            const j = (-(1 + 0.35) * vn) / (1 / ma + 1 / mb);
            A.vx -= (j * nx) / ma; A.vz -= (j * nz) / ma;
            B.vx += (j * nx) / mb; B.vz += (j * nz) / mb;
            const px = ax + nx * ar, pz = az + nz * ar;
            spinKick(A, px, pz, -j * nx, -j * nz, 0.28);
            spinKick(B, px, pz, j * nx, j * nz, 0.28);
            const imp = -vn;
            if (imp > 3 && A.hitCooldown <= 0 && B.hitCooldown <= 0) {
              A.hitCooldown = B.hitCooldown = 0.3;
              V.damage(A, Math.max(0, imp - 3) * 3.4 * (mb / ma) * 0.6, B.driver === 'player' ? 'player' : B);
              V.damage(B, Math.max(0, imp - 3) * 3.4 * (ma / mb) * 0.6, A.driver === 'player' ? 'player' : A);
              const k = clamp((imp - 3) / 20, 0, 1);
              applyImpactDamage(A, px, pz, -nx, -nz, k * Math.min(1.5, mb / ma));
              applyImpactDamage(B, px, pz, nx, nz, k * Math.min(1.5, ma / mb));
              A.stun = Math.max(A.stun, imp > 8 ? 0.8 : 0);
              B.stun = Math.max(B.stun, imp > 8 ? 0.8 : 0);
              if (imp > 7) {
                A.spinT = Math.max(A.spinT, clamp(imp / 30, 0.2, 0.9) * (mb / tot) * 2);
                B.spinT = Math.max(B.spinT, clamp(imp / 30, 0.2, 0.9) * (ma / tot) * 2);
              }
              crashFeedback(A.driver === 'player' ? A : B, imp, px, pz);
              if (A.def.kind === 'bike' && imp > 9) throwRider(A, imp);
              if (B.def.kind === 'bike' && imp > 9) throwRider(B, imp);
              G.events?.emit('vehicleCollision', A, B, imp);
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- per-frame effects and pose
  function burnFx(v, dt) {
    if (v.burning) {
      v.burnTimer -= dt;
      if (rand() < dt * 40) G.fx.fire(v.x + (rand() - 0.5), v.y + 1.0, v.z + (rand() - 0.5), 1.6);
      if (rand() < dt * 12) G.fx.smoke(v.x, v.y + 1.4, v.z, 1.6, 1.6, 0.12, 0.7);
      if (v.burnTimer <= 0) V.explode(v);
    } else if (v.dead) {
      v.wreckAge += dt;
      if (rand() < dt * 8) G.fx.smoke(v.x, v.y + 1.0, v.z, 1.6, 2, 0.15, 0.5);
      if (v.wreckAge < 25 && rand() < dt * 10) G.fx.fire(v.x + (rand() - 0.5), v.y + 0.7, v.z + (rand() - 0.5), 1.0);
    } else if (v.health < v.maxHealth * 0.45) {
      // smoking hood: grey turning black as the engine dies, with flickers of flame near the end
      v.smokeT -= dt;
      if (v.smokeT <= 0) {
        const frac = v.health / v.maxHealth;
        v.smokeT = frac < 0.2 ? 0.05 : 0.1;
        const s = Math.sin(v.heading), c = Math.cos(v.heading), f = v.def.length * 0.35;
        const hx = v.x + s * f, hz = v.z + c * f;
        G.fx.smoke(hx, v.y + 1.0, hz, 0.8 + (1 - frac), 1.6, frac < 0.2 ? 0.1 : frac < 0.32 ? 0.3 : 0.6, 0.55);
        if (frac < 0.15 && rand() < 0.25) G.fx.fire(hx, v.y + 0.9, hz, 0.6);
      }
    }
  }

  function tyreFx(v, dt) {
    const def = v.def;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    if (def.kind === 'boat') {
      // bow spray and wake foam
      if (v.speed > 6 && (v.fxT -= dt) <= 0) {
        v.fxT = 0.05;
        const f = def.length * 0.3, lx = c * def.width * 0.55, lz = -s * def.width * 0.55;
        for (const sd of [-1, 1]) G.fx.smoke(v.x + s * f + lx * sd, v.y + 0.1, v.z + c * f + lz * sd, 0.5, 0.6, 0.97, 0.45);
        G.fx.smoke(v.x - s * def.length * 0.55, v.y, v.z - c * def.length * 0.55, 0.9, 1.4, 0.95, 0.35);
      }
      v.sliding = false;
      return;
    }
    const slip = Math.abs(v.lat);
    const sliding = !v.dead && ((v.speed > 4 && (slip > 3.4 || (v.input.handbrake && v.speed > 8))) || v.burningOut);
    v.sliding = sliding;
    if (!sliding) return;
    v.skidT -= dt;
    if (v.skidT > 0) return;
    v.skidT = 0.045;
    const bike = def.kind === 'bike';
    const half = bike ? 0 : def.width / 2 - 0.15;
    const rx = c * half, rz = -s * half;
    const back = def.kind === 'bike' ? 0.72 : def.length * 0.31;
    const bx = v.x - s * back, bz = v.z - c * back;
    const hd = Math.atan2(v.vx, v.vz) || v.heading;
    G.fx.skid(bx + rx, bz + rz, v.burningOut ? v.heading : hd, Math.max(v.speed, 8));
    if (!bike) G.fx.skid(bx - rx, bz - rz, v.burningOut ? v.heading : hd, Math.max(v.speed, 8));
    G.fx.tireSmoke(bx + rx, bz + rz);
    if (v.burningOut || rand() < 0.5) G.fx.tireSmoke(bx - rx, bz - rz);
    if (v.burningOut && rand() < 0.5) G.fx.smoke(bx, 0.4, bz, 1.4, 2.2, 0.9, 0.4);
  }

  function exhaustFx(v) {
    if (!v.boosting) return;
    const s = Math.sin(v.heading), c = Math.cos(v.heading), b = v.def.length / 2 + 0.2;
    const ox = c * 0.3, oz = -s * 0.3;
    const y = v.def.kind === 'boat' ? v.y + 0.6 : v.y + 0.32;
    for (const sd of [-1, 1]) G.fx.fire(v.x - s * b + ox * sd, y, v.z - c * b + oz * sd, 0.55);
  }

  function pose(v, dt, night) {
    const def = v.def, m = v.model;
    const bike = def.kind === 'bike', boat = def.kind === 'boat';
    if (boat) {
      const bed = seabedY(v.x, v.z);
      const wy = SEA_Y + 0.5 + swell(v.x, v.z, G.time) - Math.min(0.25, v.speed * 0.008);
      const beached = bed + 0.35 > wy;
      v.y = damp(v.y, beached ? bed + 0.35 : wy, 6, dt);
      if (beached) { v.vx *= Math.exp(-2.5 * dt); v.vz *= Math.exp(-2.5 * dt); }
      const planing = clamp(v.fwd / def.maxSpeed, 0, 1);
      const bob = Math.sin(G.time * 1.7 + v.x * 0.1) * 0.03;
      v.pitch = damp(v.pitch, -planing * 0.11 + bob + v.load * 0.05, 3, dt);
      v.lean = damp(v.lean, clamp(v.angVel * v.fwd * 0.012, -0.22, 0.22), 3, dt);
      v.roll = -v.lean + Math.sin(G.time * 1.3 + v.z * 0.1) * 0.02;
    } else {
      v.y = damp(v.y, groundY(v.x, v.z), 14, dt);
      if (bike) {
        const want = v.speed < 0.5 && !v.driver ? -0.25 : clamp(Math.atan((v.angVel * v.fwd) / 9.8), -0.75, 0.75);
        v.lean = damp(v.lean, want, 6, dt);
        v.roll = -v.lean;
        // wheelie on a hard launch
        const wantWheelie = !v.dead && v.input.throttle > 0.8 && v.fwd > 1 && v.fwd < 16 && (v.launchT > 0 || v.boosting || v.load < -0.25) ? 0.32 : 0;
        v.wheelie = damp(v.wheelie, wantWheelie, wantWheelie ? 3 : 5, dt);
        v.pitch = damp(v.pitch, v.load * 0.12, 6, dt) - v.wheelie;
        v.y += Math.sin(v.wheelie) * 0.72;
      } else {
        v.pitch = damp(v.pitch, v.dead ? 0.02 : v.load * 0.1, 6, dt);
        const sway = v.burningOut ? Math.sin(G.time * 31) * 0.012 : 0;
        v.roll = damp(v.roll, v.dead ? 0.04 : clamp(v.angVel * v.fwd * 0.0042, -0.1, 0.1) + sway, 6, dt);
      }
    }
    placeModel(v);

    // wheels: fronts roll with the road, rears lock on the handbrake and blur during burnouts
    const r = m.wheelRadius;
    v.wheelSpin += (v.fwd * dt) / r;
    if (v.burningOut) v.rearSpin += 45 * dt;
    else if (!(v.input.handbrake && !v.dead)) v.rearSpin += (v.fwd * dt) / r;
    for (const w of m.wheels) {
      w.mesh.rotation.x = w.front ? v.wheelSpin : v.rearSpin;
      if (w.front) w.pivot.rotation.y = v.steerAngle * 1.1;
    }
    m.driver.visible = v.driver !== null && !v.dead;
    m.headMat.color.setScalar(v.dead ? 0 : 0.45 + 0.55 * night);
    m.tailMat.color.setScalar(v.dead ? 0 : v.braking ? 1.6 : v.reversing ? 1.0 : 0.35 + 0.45 * night);
    if (m.bar) {
      const on = v.siren && !v.dead && v.sirenOn !== false;
      const ph = Math.floor(G.time * 7) % 2;
      m.bar.redMat.color.setHex(on && ph ? 0xff2020 : 0x3a0808);
      m.bar.blueMat.color.setHex(on && !ph ? 0x2a60ff : 0x0a1030);
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
      burnFx(v, dt);
      tyreFx(v, dt);
      exhaustFx(v);
      pose(v, dt, night);
    }
    collidePairs();
  };

  return V;
}
