// Pedestrians: civilians who stroll the sidewalks, cross at corners, flee gunfire, fight back, and drop cash when hurt.
import { N, BLOCK, HALF, PITCH } from './config.js';
import { rand, angleDiff } from './random.js';
import { blockCX, blockCZ } from './citygen.js';
import { randomCivilianOutfit } from './humanoid.js';

const TARGET = 34;
const INSET = 3.4;

export function createPedestrians(G) {
  const Pd = {};
  let timer = 0;

  const cornerSigns = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  function cornerPoint(i, j, c) {
    const [sx, sz] = cornerSigns[c];
    const e = BLOCK / 2 - INSET;
    return [blockCX(i) + sx * e, blockCZ(j) + sz * e];
  }
  const CROSS = [
    // from corner c: [di, dj, target corner]
    [[-1, 0, 1], [0, -1, 3]],
    [[1, 0, 0], [0, -1, 2]],
    [[1, 0, 3], [0, 1, 1]],
    [[-1, 0, 2], [0, 1, 0]],
  ];

  function setWalk(a, i, j, c, dir) {
    a.ai = { type: 'walk', i, j, c, dir, tx: 0, tz: 0, speed: 1.3 + rand() * 0.9, wait: 0, cross: false };
    const [x, z] = cornerPoint(i, j, (c + dir + 4) % 4);
    a.ai.tx = x; a.ai.tz = z;
  }

  Pd.spawnAt = (x, z) => {
    const a = G.actors.spawn('ped', x, z, { outfit: randomCivilianOutfit(rand), health: 50 + rand() * 20 });
    return a;
  };

  function spawnWalker() {
    const P = G.player;
    for (let tries = 0; tries < 8; tries++) {
      const ang = rand() * 6.283, r = 50 + rand() * 120;
      const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
      const i = Math.floor((x + HALF) / PITCH), j = Math.floor((z + HALF) / PITCH);
      if (i < 0 || i >= N || j < 0 || j >= N) continue;
      const c = Math.floor(rand() * 4);
      const [cx, cz] = cornerPoint(i, j, c);
      // make sure it is off-screen-ish and not in sight
      const cam = G.camera3.camera.position;
      if (Math.hypot(cx - cam.x, cz - cam.z) < 55) continue;
      const a = Pd.spawnAt(cx, cz);
      setWalk(a, i, j, c, rand() < 0.5 ? 1 : -1);
      a.ai.speed *= 1;
      return;
    }
  }

  function nearestRing(a) {
    const i = Math.max(0, Math.min(N - 1, Math.floor((a.x + HALF) / PITCH)));
    const j = Math.max(0, Math.min(N - 1, Math.floor((a.z + HALF) / PITCH)));
    let best = 0, bd = 1e9;
    for (let c = 0; c < 4; c++) {
      const [x, z] = cornerPoint(i, j, c);
      const d = Math.hypot(x - a.x, z - a.z);
      if (d < bd) { bd = d; best = c; }
    }
    return [i, j, best];
  }

  function think(a, dt) {
    const ai = a.ai;
    if (!ai) return;
    if (ai.type === 'walk') {
      const dx = ai.tx - a.x, dz = ai.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        // arrived at a corner: continue round the block or cross the road
        if (ai.cross) {
          ai.cross = false;
          ai.c = ai.cc; ai.i = ai.ci; ai.j = ai.cj;
        } else {
          ai.c = (ai.c + ai.dir + 4) % 4;
        }
        if (!ai.cross && rand() < 0.22) {
          const opt = CROSS[ai.c][rand() < 0.5 ? 0 : 1];
          const ni = ai.i + opt[0], nj = ai.j + opt[1];
          if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
            const [x, z] = cornerPoint(ni, nj, opt[2]);
            ai.cross = true; ai.ci = ni; ai.cj = nj; ai.cc = opt[2];
            ai.tx = x; ai.tz = z;
            ai.wait = 0.4 + rand() * 1.4;
          }
        }
        if (!ai.cross) {
          const [x, z] = cornerPoint(ai.i, ai.j, (ai.c + ai.dir + 4) % 4);
          ai.tx = x; ai.tz = z;
        }
        a.wantVX = a.wantVZ = 0;
      } else if (ai.wait > 0) {
        ai.wait -= dt;
        a.wantVX = a.wantVZ = 0;
      } else {
        const sp = ai.cross ? ai.speed * 1.5 : ai.speed;
        a.wantVX = (dx / d) * sp;
        a.wantVZ = (dz / d) * sp;
      }
    } else if (ai.type === 'flee') {
      ai.t -= dt;
      const fx = ai.fx ?? G.player.x, fz = ai.fz ?? G.player.z;
      const dx = a.x - fx, dz = a.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      a.wantVX = (dx / d) * 6.4;
      a.wantVZ = (dz / d) * 6.4;
      if (ai.t <= 0) {
        const [i, j, c] = nearestRing(a);
        setWalk(a, i, j, c, rand() < 0.5 ? 1 : -1);
      }
    } else if (ai.type === 'fight') {
      const P = G.player;
      const dx = P.x - a.x, dz = P.z - a.z;
      const d = Math.hypot(dx, dz);
      a.faceHeading = Math.atan2(dx, dz);
      ai.cool -= dt;
      if (d > 1.5) { a.wantVX = (dx / d) * 4.8; a.wantVZ = (dz / d) * 4.8; }
      else {
        a.wantVX = a.wantVZ = 0;
        if (ai.cool <= 0 && P.mode === 'foot') {
          ai.cool = 0.9;
          a.punchT = 0.28;
          a.punchSide = !a.punchSide;
          G.player.takeDamage(5, a, { dirX: (dx / d) * 2, dirZ: (dz / d) * 2 });
        }
      }
      ai.t -= dt;
      if (ai.t <= 0 || P.mode === 'car') { a.faceHeading = null; ai.type = 'flee'; ai.t = 6; }
    }
  }

  Pd.update = (dt) => {
    const P = G.player;
    timer -= dt;
    if (timer <= 0) {
      timer = 0.3;
      let n = 0;
      for (const a of G.actors.list) if (a.kind === 'ped' && !a.dead) n++;
      if (n < TARGET) spawnWalker();
      // despawn far away peds
      for (const a of G.actors.list) {
        if (a.kind === 'ped' && !a.dead && !a.inVehicle && Math.hypot(a.x - P.x, a.z - P.z) > 210) G.actors.remove(a);
      }
    }
    for (const a of G.actors.list) {
      if (a.kind === 'ped' && !a.dead && !a.inVehicle) think(a, dt);
    }
  };

  // Reactions
  G.events.on('gunshot', (attacker, x, z) => {
    for (const a of G.actors.list) {
      if (a.kind !== 'ped' || a.dead || a.inVehicle) continue;
      if (Math.hypot(a.x - x, a.z - z) < 38 && (a.ai?.type !== 'fight')) {
        a.ai = { type: 'flee', t: 7 + rand() * 5, fx: x, fz: z };
      }
    }
  });
  G.events.on('explosion', (x, z) => {
    for (const a of G.actors.list) {
      if (a.kind !== 'ped' || a.dead) continue;
      if (Math.hypot(a.x - x, a.z - z) < 60) a.ai = { type: 'flee', t: 9, fx: x, fz: z };
    }
  });
  G.events.on('actorHit', (a, attacker) => {
    if (a.kind !== 'ped' || a.dead) return;
    if (attacker === G.player.actor || attacker === 'player') {
      if (G.player.weapon === 'fists' && rand() < 0.25) a.ai = { type: 'fight', t: 10, cool: 0.4 };
      else a.ai = { type: 'flee', t: 10, fx: G.player.x, fz: G.player.z };
    } else {
      a.ai = { type: 'flee', t: 8 };
    }
  });
  // nearby peds run when a car comes at them or someone dies
  G.events.on('actorKilled', (a) => {
    if (a.kind !== 'ped') return;
    for (const o of G.actors.list) {
      if (o.kind === 'ped' && !o.dead && Math.hypot(o.x - a.x, o.z - a.z) < 22) o.ai = { type: 'flee', t: 8, fx: a.x, fz: a.z };
    }
  });

  return Pd;
}
