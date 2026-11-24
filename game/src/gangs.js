// Gang thugs used by missions: they lurk until the player gets close or attacks, then brawl or shoot.
import { rand } from './random.js';

const OUTFITS = [
  { style: 'thug', skin: 0xc68b62, hair: 0x111111, shirt: 0x7a1f2b, pants: 0x1e1e24, shoes: 0x111111 },
  { style: 'thug', skin: 0xf1c9a5, hair: 0x111111, shirt: 0x27406e, pants: 0x1e1e24, shoes: 0x111111 },
  { style: 'thug', skin: 0x9a6642, hair: 0x111111, shirt: 0x7d6b1f, pants: 0x22222a, shoes: 0x111111 },
];

export function createGangs(G) {
  const Gg = {};

  // spawn `count` thugs around (x,z); returns list of actors
  Gg.spawn = (x, z, count, opts = {}) => {
    const out = [];
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * 6.283 + rand();
      const r = (opts.spread ?? 8) * (0.4 + rand() * 0.6);
      const a = G.actors.spawn('thug', x + Math.cos(ang) * r, z + Math.sin(ang) * r, {
        outfit: OUTFITS[k % OUTFITS.length], health: opts.health ?? 70, weapon: opts.weapon ?? 'fists', team: 'gang', armor: opts.armor ?? 0, tag: opts.tag,
      });
      a.ai = { type: 'thug', aggro: opts.aggro ?? 26, awake: false, cool: 0.5 + rand(), strafe: rand() < 0.5 ? 1 : -1, home: [a.x, a.z], dmg: opts.damage ?? 5, boss: !!opts.boss };
      a.kind = 'thug';
      out.push(a);
    }
    return out;
  };

  Gg.aliveCount = (list) => list.filter((a) => !a.dead && !a.removed).length;

  function think(a, dt) {
    const P = G.player;
    const ai = a.ai;
    const dx = P.x - a.x, dz = P.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (!ai.awake) {
      // idle sway; wake when the player is near or has been seen with a gun
      a.wantVX = a.wantVZ = 0;
      if (dist < ai.aggro && !P.dead) ai.awake = true;
      return;
    }
    if (P.dead) { a.wantVX = a.wantVZ = 0; return; }
    ai.cool -= dt;
    a.aiming = false;
    a.faceHeading = null;
    const armed = a.weapon !== 'fists';
    const los = dist < 45 && G.collision.lineOfSight(a.x, 1.4, a.z, P.x, 1.2, P.z);
    if (armed && los && dist < 26 && dist > 4) {
      a.aiming = true;
      a.faceHeading = Math.atan2(dx, dz);
      const px = -dz / dist, pz = dx / dist;
      a.wantVX = px * ai.strafe * 2.4 + (dx / dist) * (dist > 12 ? 1.8 : -0.5);
      a.wantVZ = pz * ai.strafe * 2.4 + (dz / dist) * (dist > 12 ? 1.8 : -0.5);
      if (rand() < dt * 0.5) ai.strafe *= -1;
      if (ai.cool <= 0) {
        ai.cool = a.weapon === 'smg' ? 0.25 : 0.9 + rand() * 0.6;
        const hit = rand() < 0.38 - Math.min(0.2, dist * 0.006);
        const sy = a.y + 1.35;
        a.fired = 0.14;
        G.fx.muzzle(a.x + dx / dist * 0.9, sy, a.z + dz / dist * 0.9, dx / dist, dz / dist);
        G.fx.tracer(a.x + dx / dist * 0.8, sy, a.z + dz / dist * 0.8, P.x + (hit ? 0 : (rand() - 0.5) * 5), hit ? P.y + 1 : 0.6, P.z + (hit ? 0 : (rand() - 0.5) * 5));
        G.audio?.gunshot(a.weapon, a.x, a.z);
        G.events.emit('gunshot', a, a.x, a.z);
        if (hit) {
          if (P.mode === 'car') { G.vehicles.damage(P.vehicle, 4, a); P.takeDamage(1.4, a); }
          else P.takeDamage(ai.dmg, a, { dirX: dx / dist, dirZ: dz / dist });
        }
      }
    } else if (dist > 1.5) {
      let mx = dx / dist, mz = dz / dist;
      const wall = G.collision.rayDistance(a.x, 0.9, a.z, mx, 0, mz, 3);
      if (wall < 3) {
        const left = G.collision.rayDistance(a.x, 0.9, a.z, -mz, 0, mx, 5);
        const right = G.collision.rayDistance(a.x, 0.9, a.z, mz, 0, -mx, 5);
        const side = left > right ? 1 : -1;
        const tmx = mx, tmz = mz;
        mx = -tmz * side * 0.9 + tmx * 0.25; mz = tmx * side * 0.9 + tmz * 0.25;
      }
      const sp = ai.boss ? 5.2 : 4.6;
      a.wantVX = mx * sp; a.wantVZ = mz * sp;
    } else {
      a.wantVX = a.wantVZ = 0;
      a.faceHeading = Math.atan2(dx, dz);
      if (ai.cool <= 0 && P.mode === 'foot') {
        ai.cool = 0.85;
        a.punchT = 0.28;
        a.punchSide = !a.punchSide;
        P.takeDamage(ai.boss ? 9 : 6, a, { dirX: dx / dist * 3, dirZ: dz / dist * 3 });
        G.audio?.thud(P.x, P.z, 0.6);
      }
    }
  }

  Gg.update = (dt) => {
    for (const a of G.actors.list) {
      if (a.kind === 'thug' && !a.dead && !a.inVehicle) think(a, dt);
    }
  };

  G.events.on('actorHit', (a) => {
    if (a.kind === 'thug' && a.ai) a.ai.awake = true;
  });
  G.events.on('gunshot', (att, x, z) => {
    if (att !== G.player.actor) return;
    for (const a of G.actors.list) if (a.kind === 'thug' && a.ai && Math.hypot(a.x - x, a.z - z) < 45) a.ai.awake = true;
  });

  return Gg;
}
