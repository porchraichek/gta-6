// Actor manager: every humanoid in the world (player, pedestrians, cops, thugs) with movement, damage, death and animation.
import * as THREE from 'three';
import { buildHumanoid, gunGeometry, randomCivilianOutfit } from './humanoid.js';
import { WEAPONS } from './config.js';
import { clamp, damp, angleDiff, rand } from './random.js';
import { groundY } from './roadnet.js';
import { clampToIsland } from './collision.js';

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
      crouch: 0, hitT: 0,
    };
    setWeapon(a, a.weapon);
    list.push(a);
    return a;
  };

  function setWeapon(a, id) {
    a.weapon = id;
    const gun = a.model.gun;
    if (id === 'fists') gun.visible = false;
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
    a.stagger = 0.18;
    if (opts.dirX !== undefined) {
      a.kx += opts.dirX * (opts.knock ?? 2);
      a.kz += opts.dirZ * (opts.knock ?? 2);
    }
    G.events.emit('actorHit', a, attacker, amount);
    if (a.health <= 0) {
      a.health = 0;
      a.dead = true;
      a.deadT = 0;
      a.wantVX = a.wantVZ = 0;
      if (a.inVehicle) a.inVehicle = null;
      a.model.gun.visible = a.weapon !== 'fists';
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

  // Vehicles run people over: called each frame with the vehicle list.
  A.collideVehicles = (vehicles) => {
    for (const v of vehicles) {
      if (v.dead || v.speed < 3.2) continue;
      const cs = G.vehicles.circles(v);
      const all = list;
      for (const a of all) {
        if (a.dead || a.inVehicle) continue;
        if (Math.abs(a.x - v.x) > 4.5 || Math.abs(a.z - v.z) > 4.5) continue;
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

      if (a.dead) {
        a.deadT += dt;
        // fall over and slide a bit
        const t = clamp(a.deadT / 0.5, 0, 1);
        m.group.rotation.x = -1.5 * t;
        a.x += a.kx * dt; a.z += a.kz * dt;
        a.kx *= Math.exp(-5 * dt); a.kz *= Math.exp(-5 * dt);
        a.y = damp(a.y, groundY(a.x, a.z) + 0.12, 12, dt);
        m.group.position.set(a.x, a.y, a.z);
        m.group.rotation.y = a.heading;
        m.armL.rotation.x = m.armR.rotation.x = 0;
        m.legL.rotation.x = m.legR.rotation.x = 0;
        if (a.deadT > 14 || distP > 260) {
          if (a.deadT > 14) m.group.position.y -= (a.deadT - 14) * 0.3;
          if (a.deadT > 18 || distP > 260) A.remove(a);
        }
        continue;
      }

      // locomotion
      const stag = a.stagger > 0 ? 0.35 : 1;
      a.stagger -= dt;
      a.vx = damp(a.vx, a.wantVX * stag, 12, dt);
      a.vz = damp(a.vz, a.wantVZ * stag, 12, dt);
      let mvx = a.vx + a.kx, mvz = a.vz + a.kz;
      a.kx *= Math.exp(-7 * dt); a.kz *= Math.exp(-7 * dt);
      a.x += mvx * dt;
      a.z += mvz * dt;
      if (!a.noCollide) {
        const res = G.collision.pushCircle(a.x, a.z, a.radius);
        if (res.hit) { a.x = res.x; a.z = res.z; }
        tmpDir.x = a.x; tmpDir.z = a.z;
        if (clampToIsland(tmpDir, 1)) { a.x = tmpDir.x; a.z = tmpDir.z; }
      }
      // vertical (jumping and curb steps)
      const gy = groundY(a.x, a.z);
      if (!a.grounded) {
        a.vy -= 22 * dt;
        a.y += a.vy * dt;
        if (a.y <= gy) { a.y = gy; a.vy = 0; a.grounded = true; }
      } else {
        a.y = damp(a.y, gy, 18, dt);
      }
      a.speed = Math.hypot(a.vx, a.vz);
      // facing
      let target = a.faceHeading;
      if (target === null) target = a.speed > 0.3 ? Math.atan2(a.vx, a.vz) : a.heading;
      a.heading += angleDiff(a.heading, target) * Math.min(1, dt * (a.faceHeading === null ? 10 : 14));

      // animation
      a.walkPhase += a.speed * dt * 2.6;
      const swing = Math.sin(a.walkPhase) * clamp(a.speed / 3.2, 0, 1.3) * 0.75;
      m.legL.rotation.x = swing;
      m.legR.rotation.x = -swing;
      m.armL.rotation.x = -swing * 0.8;
      m.armR.rotation.x = swing * 0.8;
      m.armL.rotation.z = 0.05;
      m.armR.rotation.z = -0.05;
      const armed = a.weapon !== 'fists';
      if (armed && (a.aiming || a.fired > 0)) {
        m.armR.rotation.x = -Math.PI / 2 + 0.05;
        if (a.weapon !== 'pistol') m.armL.rotation.x = -Math.PI / 2 + 0.35;
        if (a.weapon !== 'pistol') m.armL.rotation.z = -0.35;
      } else if (armed) {
        m.armR.rotation.x = -0.7;
      }
      if (a.fired > 0) {
        a.fired -= dt;
        m.armR.rotation.x -= Math.max(0, a.fired) * 1.2;
      }
      if (a.punchT > 0) {
        a.punchT -= dt;
        const k = 1 - clamp(a.punchT / 0.28, 0, 1);
        const swingP = Math.sin(k * Math.PI);
        const side = a.punchSide ? m.armL : m.armR;
        side.rotation.x = -Math.PI / 2 * swingP;
        m.torso.rotation.y = (a.punchSide ? 0.3 : -0.3) * swingP;
      } else {
        m.torso.rotation.y = 0;
      }
      m.group.position.set(a.x, a.y, a.z);
      m.group.rotation.set(a.stagger > 0 ? 0.12 : 0, a.heading, 0, 'YXZ');
    }
  };

  return A;
}
