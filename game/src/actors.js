// Actor manager: every humanoid in the world (player, pedestrians, cops, thugs) with movement, standing on low boxes,
// damage, hit reactions, death falls, and the procedural animation (walk/run cycle, aim poses, melee, crouch, roll, climb).
import { buildHumanoid, gunGeometry, randomCivilianOutfit } from './humanoid.js';
import { WEAPONS } from './config.js';
import { clamp, damp, angleDiff, rand } from './random.js';
import { groundY } from './roadnet.js';
import { clampToIsland } from './collision.js';

const STEP_UP = 0.45; // boxes this far below the feet are stood on rather than pushed out of
const SHADOW_DIST = 50;
const PI = Math.PI;

export function createActors(G) {
  const list = [];
  const A = { list };

  A.spawn = (kind, x, z, opts = {}) => {
    const outfit = opts.outfit || randomCivilianOutfit(rand);
    const model = buildHumanoid(outfit);
    G.scene.add(model.group);
    const a = {
      kind, team: opts.team || (kind === 'ped' ? 'civ' : kind), x, z, y: groundY(x, z), vy: 0, heading: opts.heading ?? rand() * 6.28, faceHeading: null,
      vx: 0, vz: 0, wantVX: 0, wantVZ: 0, kx: 0, kz: 0, speed: 0, health: opts.health ?? 60, maxHealth: opts.health ?? 60, armor: opts.armor ?? 0,
      dead: false, deadT: 0, model, outfit, weapon: opts.weapon || 'fists', ammo: opts.ammo ?? 999, radius: 0.36, walkPhase: rand() * 6.28, punchT: 0, aiming: false,
      inVehicle: null, stagger: 0, ai: null, age: 0, grounded: true, noCollide: false, fired: 0, id: Math.random(), tag: opts.tag || null, value: opts.value ?? 0,
      crouch: 0, crouching: false, hitT: 0, hitDirX: 0, hitDirZ: 0, deathStyle: 0, accel: 12, rollT: 0, rollDur: 0.5, climb: null, throwT: 0, swingT: 0, punchKind: 0,
    };
    setWeapon(a, a.weapon);
    list.push(a);
    return a;
  };

  function setWeapon(a, id) {
    a.weapon = id;
    const gun = a.model.gun;
    if (id === 'fists' || !WEAPONS[id]) gun.visible = false;
    else {
      gun.geometry = gunGeometry(id);
      gun.visible = true;
    }
  }
  A.setWeapon = setWeapon;

  A.remove = (a) => {
    const i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1);
    G.scene.remove(a.model.group);
    a.removed = true;
  };

  A.damage = (a, amount, attacker, opts = {}) => {
    if (a.dead || amount <= 0) return false;
    if (a.kind === 'player') {
      G.player.takeDamage(amount, attacker, opts);
      return false;
    }
    if (a.armor > 0) {
      const ab = Math.min(a.armor, amount * 0.6);
      a.armor -= ab;
      amount -= ab;
    }
    a.health -= amount;
    a.hitT = 0.25;
    // hit reaction: a flinch that scales with the blow, heavier for melee finishers and blasts
    a.stagger = Math.max(a.stagger, clamp(amount / 60, 0.15, 0.6) + (opts.heavy ? 0.5 : 0));
    if (opts.dirX !== undefined) {
      const n = Math.hypot(opts.dirX, opts.dirZ) || 1;
      a.hitDirX = opts.dirX / n; a.hitDirZ = opts.dirZ / n;
      a.kx += opts.dirX * (opts.knock ?? 2);
      a.kz += opts.dirZ * (opts.knock ?? 2);
    }
    G.events.emit('actorHit', a, attacker, amount, opts);
    if (a.health <= 0) {
      a.health = 0;
      a.dead = true;
      a.deadT = 0;
      a.wantVX = a.wantVZ = 0;
      a.climb = null;
      if (a.inVehicle) a.inVehicle = null;
      // fall away from the hit: backwards when struck from the front, otherwise forward or a knee-buckle crumple
      const front = a.hitDirX * Math.sin(a.heading) + a.hitDirZ * Math.cos(a.heading) < 0;
      a.deathStyle = opts.blast || opts.vehicle ? 3 : front ? (rand() < 0.65 ? 0 : 2) : 1;
      a.deathSide = rand() < 0.5 ? -1 : 1;
      a.model.gun.visible = false;
      G.events.emit('actorKilled', a, attacker, opts);
      return true;
    }
    return false;
  };

  A.nearest = (x, z, maxDist, filter) => {
    let best = null, bd = maxDist;
    for (const a of list) {
      if (a.dead || a.inVehicle || a.kind === 'player') continue;
      if (filter && !filter(a)) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };

  // Height of the highest walkable surface under (x,z) for something whose feet are at y: terrain or a low box top.
  A.supportHeight = (x, z, y, r = 0.2) => {
    let h = groundY(x, z);
    const near = G.collision.query(x, z, r + 0.5);
    for (const c of near) {
      if (c.h < 0.2 || c.h > y + STEP_UP) continue;
      if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
      if (c.h > h) h = c.h;
    }
    return h;
  };

  // Push a circle out of boxes taller than the actor's feet (so actors can stand on containers and walls).
  function pushOut(a) {
    const r = a.radius;
    const near = G.collision.query(a.x, a.z, r + 1);
    let x = a.x, z = a.z;
    for (const c of near) {
      if (c.h < 0.2 || c.h <= a.y + STEP_UP) continue;
      const px = Math.max(c.x0, Math.min(x, c.x1)), pz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - px, dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (r - d); z += (dz / d) * (r - d);
      } else {
        const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z;
        const m = Math.min(l, rr, t, b);
        if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r;
      }
    }
    a.x = x; a.z = z;
  }

  // Vehicles run people over: called each frame with the vehicle list.
  A.collideVehicles = (vehicles) => {
    for (const v of vehicles) {
      if (v.dead || v.speed < 3.2) continue;
      const cs = G.vehicles.circles(v);
      for (const a of list) {
        if (a.dead || a.inVehicle || a.y > (v.y ?? 0) + 1.6) continue;
        if (Math.abs(a.x - v.x) > 4.5 || Math.abs(a.z - v.z) > 4.5) continue;
        if (a.kind === 'player' && G.player.invulnerable?.()) continue;
        for (const [cx, cz, r] of cs) {
          const dx = a.x - cx, dz = a.z - cz;
          if (dx * dx + dz * dz < (r + a.radius) ** 2) {
            const dmg = clamp(v.speed * 4.4, 12, 160);
            const n = Math.hypot(dx, dz) || 1;
            A.damage(a, dmg, v.driver === 'player' ? 'player' : v, { dirX: v.vx * 0.5 + dx / n * 3, dirZ: v.vz * 0.5 + dz / n * 3, knock: 1, vehicle: true });
            a.vyKick = 4;
            a.vy = 3.5;
            a.grounded = false;
            G.fx.dust(a.x, 0.5, a.z, 3);
            G.audio?.thud(a.x, a.z, 0.8);
            if (v.driver === 'player') {
              G.fx.addShake(0.12);
              v.vx *= 0.93; v.vz *= 0.93;
            }
            break;
          }
        }
      }
    }
  };

  function setShadows(m, on) {
    if (m.shadows === on) return;
    m.shadows = on;
    for (const mesh of m.meshes) mesh.castShadow = on;
  }

  function animateDead(a, m, dt) {
    a.deadT += dt;
    a.x += a.kx * dt; a.z += a.kz * dt;
    a.kx *= Math.exp(-5 * dt); a.kz *= Math.exp(-5 * dt);
    const floor = A.supportHeight(a.x, a.z, a.y + 0.3);
    if (a.y > floor + 0.2 && !a.grounded) { a.vy -= 22 * dt; a.y = Math.max(floor, a.y + a.vy * dt); }
    else a.y = damp(a.y, floor, 12, dt);
    const s = a.deathStyle;
    // crumple: knees give first, then the body tips forward
    const knee = s === 2 ? clamp(a.deadT / 0.3, 0, 1) : 0;
    const t = clamp((a.deadT - (s === 2 ? 0.25 : 0)) / (s === 3 ? 0.35 : 0.55), 0, 1);
    const ease = t * t * (3 - 2 * t);
    const fall = s === 0 || s === 3 ? -1.52 : 1.5;
    const bounce = t >= 1 ? 0 : Math.sin(t * PI) * 0.03;
    m.group.position.set(a.x, a.y + 0.06 + bounce - knee * 0.35 * (1 - ease), a.z);
    m.group.rotation.set(fall * ease, a.heading, a.deathSide * 0.25 * ease, 'YXZ');
    m.legL.rotation.x = -knee * 0.9 * (1 - ease) + (s === 0 ? -0.25 : 0.1) * ease;
    m.legR.rotation.x = -knee * 0.9 * (1 - ease) + (s === 0 ? 0.15 : -0.2) * ease;
    m.shinL.rotation.x = knee * 1.6 * (1 - ease) + 0.3 * ease;
    m.shinR.rotation.x = knee * 1.6 * (1 - ease) + 0.1 * ease;
    // arms fling out as the body hits the ground
    m.armL.rotation.set(-0.6 * ease * (s === 1 ? -1 : 1), 0, 0.9 * ease);
    m.armR.rotation.set(-0.3 * ease, 0, -1.1 * ease);
    m.torso.rotation.y = 0;
  }

  function animateLimbs(a, m, dt) {
    const w = WEAPONS[a.weapon] || WEAPONS.fists;
    const run = clamp((a.speed - 4.5) / 3, 0, 1);
    a.walkPhase += a.speed * dt * (2.3 - run * 0.4);
    const amp = clamp(a.speed / 3.2, 0, 1.25) * (0.7 + run * 0.25);
    const s = Math.sin(a.walkPhase);
    const crouch = a.crouch;
    // legs with knee bend on the back-swing
    m.legL.rotation.set(s * amp - crouch * 1.15, 0, 0);
    m.legR.rotation.set(-s * amp - crouch * 1.15, 0, 0);
    m.shinL.rotation.x = Math.max(0, Math.sin(a.walkPhase - 1.3)) * amp * (1.1 + run * 0.6) + crouch * 1.75;
    m.shinR.rotation.x = Math.max(0, Math.sin(a.walkPhase + PI - 1.3)) * amp * (1.1 + run * 0.6) + crouch * 1.75;
    // arm swing, wider when running
    const armAmp = amp * (0.75 + run * 0.4);
    m.armL.rotation.set(-s * armAmp - run * 0.3, 0, 0.06);
    m.armR.rotation.set(s * armAmp - run * 0.3, 0, -0.06);
    m.torso.rotation.set(run * 0.12 * amp, s * amp * 0.08, 0);

    const ready = a.aiming || a.fired > 0;
    if (w.kind === 'gun') {
      if (ready) {
        const twoHand = a.weapon !== 'pistol';
        m.armR.rotation.set(-PI / 2 + 0.05, 0, twoHand ? 0.12 : 0);
        m.armL.rotation.set(twoHand ? -PI / 2 + 0.3 : -PI / 2 + 0.2, 0, twoHand ? -0.62 : -0.5);
        m.torso.rotation.set(0, twoHand ? -0.18 : 0, 0);
      } else if (a.weapon === 'pistol') m.armR.rotation.x = -0.35 + s * armAmp * 0.3;
      else { m.armR.rotation.set(-0.9, 0, 0.35); m.armL.rotation.set(-0.85, 0, -0.55); }
      if (a.fired > 0) m.armR.rotation.x -= Math.max(0, a.fired) * (a.weapon === 'shotgun' || a.weapon === 'marksman' ? 2.2 : 1);
    } else if (w.kind === 'throw') {
      if (a.throwT > 0) {
        const k = 1 - clamp(a.throwT / 0.35, 0, 1);
        m.armR.rotation.set(-2.7 + k * 2.2, 0, -0.2);
        m.torso.rotation.y = -0.4 + k * 0.7;
      } else if (a.aiming) { m.armR.rotation.set(-2.6, 0, -0.25); m.armL.rotation.set(-1.2, 0, -0.2); m.torso.rotation.y = -0.35; }
    } else if (a.weapon === 'bat') {
      if (a.swingT > 0) {
        const k = 1 - clamp(a.swingT / 0.32, 0, 1);
        const e = Math.sin(k * PI * 0.5);
        m.armR.rotation.set(-2.3 + e * 1.6, 0, 0.9 - e * 1.9);
        m.armL.rotation.set(-1.1, 0, -0.4);
        m.torso.rotation.y = 0.7 - e * 1.4;
      } else m.armR.rotation.set(-0.4 + s * armAmp * 0.2, 0, -0.06);
    }
    if (a.punchT > 0) {
      const k = 1 - clamp(a.punchT / 0.28, 0, 1);
      const p = Math.sin(k * PI);
      if (a.punchKind === 2) { // uppercut with both shoulders behind it
        m.armR.rotation.set(-PI * 0.75 * p, 0, 0.2 * p);
        m.torso.rotation.set(-0.15 * p, -0.35 * p, 0);
      } else {
        const side = a.punchSide ? m.armL : m.armR;
        side.rotation.set(-PI / 2 * p, 0, (a.punchSide ? -0.25 : 0.25) * p);
        m.torso.rotation.y = (a.punchSide ? 0.35 : -0.35) * p;
      }
    }
  }

  const tmpDir = { x: 0, z: 0 };
  A.update = (dt) => {
    const px = G.player.x, pz = G.player.z;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      a.age += dt;
      if (a.hitT > 0) a.hitT -= dt;
      const m = a.model;
      const distP = Math.hypot(a.x - px, a.z - pz);
      m.group.visible = !a.inVehicle && distP < 230;
      if (a.inVehicle) continue;
      setShadows(m, distP < SHADOW_DIST);

      if (a.dead) {
        animateDead(a, m, dt);
        if (a.deadT > 14 || distP > 260) {
          if (a.deadT > 14) m.group.position.y -= (a.deadT - 14) * 0.3;
          if (a.deadT > 18 || distP > 260) A.remove(a);
        }
        continue;
      }

      // scripted climb onto a ledge: rise, then step forward on top
      if (a.climb) {
        const c = a.climb;
        c.t += dt;
        const k = clamp(c.t / c.dur, 0, 1);
        const up = clamp(k / 0.65, 0, 1), fwd = clamp((k - 0.45) / 0.55, 0, 1);
        a.y = c.y0 + (c.y1 - c.y0) * (1 - (1 - up) * (1 - up));
        a.x = c.x0 + (c.x1 - c.x0) * fwd; a.z = c.z0 + (c.z1 - c.z0) * fwd;
        a.vx = a.vz = a.kx = a.kz = a.vy = 0;
        a.speed = 0;
        m.group.position.set(a.x, a.y, a.z);
        m.group.rotation.set(0.25 * (1 - fwd), a.heading, 0, 'YXZ');
        m.armL.rotation.set(-2.9 + up * 1.6, 0, 0.1); m.armR.rotation.set(-2.9 + up * 1.6, 0, -0.1);
        m.legL.rotation.x = -1.2 * Math.sin(k * PI); m.legR.rotation.x = -0.5 * Math.sin(k * PI);
        m.shinL.rotation.x = 1.6 * Math.sin(k * PI); m.shinR.rotation.x = 1.0 * Math.sin(k * PI);
        if (k >= 1) { a.climb = null; a.grounded = true; }
        continue;
      }

      // locomotion
      const stag = a.stagger > 0 ? 0.35 : 1;
      a.stagger -= dt;
      const acc = a.grounded ? a.accel : Math.min(a.accel, 2.5);
      a.vx = damp(a.vx, a.wantVX * stag, acc, dt);
      a.vz = damp(a.vz, a.wantVZ * stag, acc, dt);
      a.x += (a.vx + a.kx) * dt;
      a.z += (a.vz + a.kz) * dt;
      a.kx *= Math.exp(-7 * dt); a.kz *= Math.exp(-7 * dt);
      if (!a.noCollide) {
        pushOut(a);
        tmpDir.x = a.x; tmpDir.z = a.z;
        if (clampToIsland(tmpDir, 1)) { a.x = tmpDir.x; a.z = tmpDir.z; }
      }
      // vertical: jumping, falling off ledges, stepping onto curbs and low boxes
      const gy = A.supportHeight(a.x, a.z, a.y, 0.12);
      if (a.grounded && gy < a.y - 0.6) { a.grounded = false; a.vy = 0; }
      if (!a.grounded) {
        a.vy -= 22 * dt;
        a.y += a.vy * dt;
        if (a.y <= gy) {
          if (a.vy < -13 && a.kind === 'player') G.player.onHardLanding?.(-a.vy);
          a.y = gy; a.vy = 0; a.grounded = true;
        }
      } else {
        a.y = damp(a.y, gy, 18, dt);
      }
      a.speed = Math.hypot(a.vx, a.vz);
      // facing
      let target = a.faceHeading;
      if (target === null) target = a.speed > 0.3 ? Math.atan2(a.vx, a.vz) : a.heading;
      a.heading += angleDiff(a.heading, target) * Math.min(1, dt * (a.faceHeading === null ? 10 : 14));
      a.crouch = damp(a.crouch, a.crouching ? 1 : 0, 12, dt);
      if (a.fired > 0) a.fired -= dt;
      if (a.punchT > 0) a.punchT -= dt;
      if (a.swingT > 0) a.swingT -= dt;
      if (a.throwT > 0) a.throwT -= dt;

      if (!m.group.visible) continue;
      animateLimbs(a, m, dt);
      const bob = a.grounded ? Math.abs(Math.cos(a.walkPhase)) * clamp(a.speed / 6, 0, 1) * 0.06 : 0;
      let lean = a.stagger > 0 ? -0.3 * clamp(a.stagger / 0.3, 0, 1) : 0;
      // lean into hits from behind instead of away
      if (a.stagger > 0 && a.hitDirX * Math.sin(a.heading) + a.hitDirZ * Math.cos(a.heading) > 0) lean = -lean;
      if (a.rollT > 0) {
        // forward roll about the hips
        const k = 1 - clamp(a.rollT / a.rollDur, 0, 1);
        const th = k * PI * 2, c = 0.55;
        const sx = Math.sin(a.heading), cz = Math.cos(a.heading);
        m.group.position.set(a.x - sx * c * Math.sin(th), a.y + c - c * Math.cos(th) - 0.3 * Math.sin(k * PI), a.z - cz * c * Math.sin(th));
        m.group.rotation.set(th, a.heading, 0, 'YXZ');
        m.legL.rotation.x = m.legR.rotation.x = -1.4 * Math.sin(k * PI);
        m.shinL.rotation.x = m.shinR.rotation.x = 2.0 * Math.sin(k * PI);
        m.armL.rotation.x = m.armR.rotation.x = -1.2 * Math.sin(k * PI);
      } else {
        m.group.position.set(a.x, a.y + bob - a.crouch * 0.36, a.z);
        m.group.rotation.set(lean + (a.grounded ? 0 : -0.1), a.heading, 0, 'YXZ');
      }
    }
  };

  return A;
}
