// Combat: hitscan shooting, melee, and explosions that damage actors, vehicles and the player.
import { WEAPONS } from './config.js';
import { rand, clamp } from './random.js';

export function createCombat(G) {
  const C = {};

  // Ray against a vertical cylinder: returns distance t or Infinity.
  function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, maxT) {
    const fx = ox - cx, fz = oz - cz;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return Infinity;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0 || t > maxT) return Infinity;
    const y = oy + dy * t;
    if (y < y0 || y > y1) return Infinity;
    return t;
  }

  // Find the first thing a ray hits. ignore: actor or vehicle to skip.
  C.trace = (ox, oy, oz, dx, dy, dz, maxT, ignore) => {
    let best = { t: maxT, type: 'none', actor: null, vehicle: null };
    const wallT = G.collision.rayDistance(ox, oy, oz, dx, dy, dz, maxT);
    if (wallT < best.t) best = { t: wallT, type: 'wall', actor: null, vehicle: null };
    if (dy < 0) {
      const gt = (0.05 - oy) / dy;
      if (gt > 0 && gt < best.t) best = { t: gt, type: 'ground', actor: null, vehicle: null };
    }
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle || a === ignore) continue;
      if (Math.abs(a.x - ox) > maxT + 2 || Math.abs(a.z - oz) > maxT + 2) continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, a.x, a.z, 0.42, a.y, a.y + 1.9, best.t);
      if (t < best.t) best = { t, type: 'actor', actor: a, vehicle: null, head: oy + dy * t - a.y > 1.55 };
    }
    for (const v of G.vehicles.list) {
      if (v === ignore || v.removed) continue;
      if (Math.abs(v.x - ox) > maxT + 4 || Math.abs(v.z - oz) > maxT + 4) continue;
      for (const [cx, cz, r] of G.vehicles.circles(v)) {
        const t = rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r + 0.1, 0.1, v.def.height + 0.35, best.t);
        if (t < best.t) best = { t, type: 'vehicle', actor: null, vehicle: v };
      }
    }
    return best;
  };

  // Fire a weapon. origin/dir in world space. Returns the trace result of the first pellet.
  C.fire = (attacker, weaponId, ox, oy, oz, dx, dy, dz, opts = {}) => {
    const w = WEAPONS[weaponId];
    const pellets = w.pellets || 1;
    let first = null;
    const mult = opts.damageMult ?? 1;
    for (let p = 0; p < pellets; p++) {
      const sp = (w.spread || 0) * (opts.spreadMult ?? 1);
      let ddx = dx + (rand() - 0.5) * sp * 2, ddy = dy + (rand() - 0.5) * sp * 2, ddz = dz + (rand() - 0.5) * sp * 2;
      const l = Math.hypot(ddx, ddy, ddz);
      ddx /= l; ddy /= l; ddz /= l;
      const hit = C.trace(ox, oy, oz, ddx, ddy, ddz, w.range, attacker.kind === 'vehicle' ? attacker : attacker);
      if (!first) first = hit;
      const ex = ox + ddx * hit.t, ey = oy + ddy * hit.t, ez = oz + ddz * hit.t;
      if (p < 3 || weaponId !== 'shotgun') G.fx.tracer(ox + ddx * 0.6, oy + ddy * 0.6, oz + ddz * 0.6, ex, ey, ez);
      if (hit.type === 'actor') {
        const dmg = w.damage * mult * (hit.head ? 2.4 : 1);
        G.actors.damage(hit.actor, dmg, attacker, { dirX: ddx * 2, dirZ: ddz * 2, knock: 1.2, gun: weaponId, head: hit.head });
        G.fx.impact(ex, ey, ez, [0.8, 0.2, 0.2]);
        G.events.emit('bulletHitActor', hit.actor, attacker, hit.head);
      } else if (hit.type === 'vehicle') {
        G.vehicles.damage(hit.vehicle, w.damage * 0.55 * mult, attacker.kind === 'player' ? 'player' : attacker);
        G.fx.impact(ex, ey, ez);
        G.audio?.ricochet(ex, ez);
        G.events.emit('bulletHitVehicle', hit.vehicle, attacker);
      } else if (hit.type === 'wall' || hit.type === 'ground') {
        G.fx.impact(ex, ey, ez, hit.type === 'ground' ? [0.7, 0.62, 0.5] : [0.8, 0.8, 0.8]);
      }
    }
    G.events.emit('gunshot', attacker, ox, oz);
    return first;
  };

  // Close-range punch/kick: hits the closest target in front. Returns the struck actor (or null).
  C.melee = (attacker, weaponId, damageMult = 1) => {
    const w = WEAPONS[weaponId] || WEAPONS.fists;
    const s = Math.sin(attacker.heading), c = Math.cos(attacker.heading);
    let best = null, bd = 1e9;
    for (const a of G.actors.list) {
      if (a === attacker || a.dead || a.inVehicle || a.kind === 'player' && attacker.kind === 'player') continue;
      const dx = a.x - attacker.x, dz = a.z - attacker.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + 0.5) continue;
      const dot = (dx * s + dz * c) / (d || 1);
      if (dot < 0.35 && d > 0.9) continue;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      const dx = best.x - attacker.x, dz = best.z - attacker.z, d = Math.hypot(dx, dz) || 1;
      G.actors.damage(best, w.damage * damageMult, attacker, { dirX: (dx / d) * 4, dirZ: (dz / d) * 4, knock: 2, melee: true });
      G.fx.spark(best.x, 1.2, best.z, 4, 3);
      G.audio?.thud(best.x, best.z, 0.7);
      G.events.emit('meleeHit', best, attacker);
    }
    return best;
  };

  C.explodeAt = (x, z, radius, damage, attacker, source) => {
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < radius) {
        const f = 1 - d / radius;
        const n = d || 1;
        G.actors.damage(a, damage * f, attacker || 'blast', { dirX: ((a.x - x) / n) * 14, dirZ: ((a.z - z) / n) * 14, knock: 1, blast: true });
        a.vy = 6; a.grounded = false;
      }
    }
    if (G.player.mode === 'foot') {
      const pa = G.player.actor;
      const d = Math.hypot(pa.x - x, pa.z - z);
      if (d < radius) G.player.takeDamage(damage * (1 - d / radius) * 0.9, attacker || 'blast', { blast: true });
    }
    for (const v of G.vehicles.list) {
      if (v === source || v.dead) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < radius + 2) {
        const f = 1 - d / (radius + 2);
        G.vehicles.damage(v, damage * f * 1.2, attacker);
        v.vx += ((v.x - x) / (d || 1)) * 9 * f;
        v.vz += ((v.z - z) / (d || 1)) * 9 * f;
        if (v.driver === 'player') G.player.takeDamage(damage * f * 0.5, 'blast', { blast: true });
      }
    }
    G.events.emit('explosion', x, z, attacker);
  };

  void clamp;
  return C;
}
