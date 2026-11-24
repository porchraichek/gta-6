// Pedestrians: civilians who stroll, jog, chat in groups and walk dogs along the sidewalks, cross at corners,
// dive out of the way of speeding cars, cower or flee from gunfire and guns pointed at them, fight back, drop cash when hurt.
import { N, BLOCK, HALF, PITCH } from './config.js';
import { rand, angleDiff } from './random.js';
import { blockCX, blockCZ } from './citygen.js';
import { randomCivilianOutfit } from './humanoid.js';
import { createDogs } from './dogs.js';

const TARGET = 50;
const INSET = 3.4;
const DESPAWN = 210;

export function createPedestrians(G) {
  const Pd = {};
  const dogs = createDogs(G);
  Pd.dogs = dogs;
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

  function setWalk(a, i, j, c, dir, speed) {
    a.ai = { type: 'walk', i, j, c, dir, tx: 0, tz: 0, speed: speed ?? a.walkSpeed ?? 1.3 + rand() * 0.9, wait: 0, cross: false };
    const [x, z] = cornerPoint(i, j, (c + dir + 4) % 4);
    a.ai.tx = x; a.ai.tz = z;
  }

  // Random body proportions so crowds are not clones.
  function vary(a) {
    const h = 0.9 + rand() * 0.18, w = 0.94 + rand() * 0.2;
    a.model.group.scale.set(w, h, w);
    a.baseScaleY = h;
  }

  Pd.spawnAt = (x, z) => {
    const a = G.actors.spawn('ped', x, z, { outfit: randomCivilianOutfit(rand), health: 50 + rand() * 20 });
    vary(a);
    return a;
  };

  function blockAt(x, z) {
    const i = Math.floor((x + HALF) / PITCH), j = Math.floor((z + HALF) / PITCH);
    return i < 0 || i >= N || j < 0 || j >= N ? null : [i, j];
  }

  // A point somewhere along the sidewalk ring of block (i,j), away from the camera.
  function sidewalkPoint(i, j) {
    const c = Math.floor(rand() * 4);
    const [ax, az] = cornerPoint(i, j, c), [bx, bz] = cornerPoint(i, j, (c + 1) % 4);
    const t = 0.15 + rand() * 0.7;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, c };
  }

  function spawnSomeone() {
    const P = G.player;
    const cam = G.camera3.camera.position;
    for (let tries = 0; tries < 8; tries++) {
      const ang = rand() * 6.283, r = 45 + rand() * 120;
      const blk = blockAt(P.x + Math.cos(ang) * r, P.z + Math.sin(ang) * r);
      if (!blk) continue;
      const [i, j] = blk;
      const p = sidewalkPoint(i, j);
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 50) continue;
      const roll = rand();
      if (roll < 0.16) return spawnGroup(p, i, j);
      const a = Pd.spawnAt(p.x, p.z);
      if (roll < 0.28) {
        a.walkSpeed = 3.2 + rand() * 0.8; // jogger
      } else if (roll < 0.4 && dogs.canAdd()) {
        a.walkSpeed = 1.1 + rand() * 0.3;
        dogs.attach(a);
      }
      setWalk(a, i, j, p.c, rand() < 0.5 ? 1 : -1);
      return;
    }
  }

  // Two to four friends standing in a loose circle, chatting.
  function spawnGroup(p, i, j) {
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + rand() * 0.4;
      const a = Pd.spawnAt(p.x + Math.cos(ang) * 0.75, p.z + Math.sin(ang) * 0.75);
      a.ai = { type: 'chat', t: 12 + rand() * 25, cx: p.x, cz: p.z, i, j, c: p.c, nodT: rand() * 3 };
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

  function resumeWalking(a) {
    const [i, j, c] = nearestRing(a);
    setWalk(a, i, j, c, rand() < 0.5 ? 1 : -1);
  }

  function setPosture(a, cowering) {
    if (!!a.cowering === cowering) return;
    a.cowering = cowering;
    a.model.group.scale.y = (a.baseScaleY ?? 1) * (cowering ? 0.7 : 1);
    a.model.torso.rotation.x = cowering ? 0.55 : 0;
  }

  function flee(a, fx, fz, t = 8) {
    a.ai = { type: 'flee', t, fx, fz };
  }

  function think(a, dt) {
    const ai = a.ai;
    if (!ai) return;
    setPosture(a, ai.type === 'cower');
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
        const sp = ai.cross ? Math.max(ai.speed, 1.9) : ai.speed;
        a.wantVX = (dx / d) * sp;
        a.wantVZ = (dz / d) * sp;
        // now and then stop to look at a phone / window
        if (!ai.cross && ai.speed < 2.5 && rand() < dt * 0.02) ai.wait = 2 + rand() * 5;
      }
    } else if (ai.type === 'chat') {
      a.wantVX = a.wantVZ = 0;
      ai.t -= dt;
      ai.nodT -= dt;
      const face = Math.atan2(ai.cx - a.x, ai.cz - a.z);
      if (ai.nodT <= 0) { ai.nodT = 1.5 + rand() * 3; ai.look = (rand() - 0.5) * 0.9; }
      a.faceHeading = face + (ai.look || 0) * 0.5;
      a.model.torso.rotation.x = Math.max(0, Math.sin(G.time * 3 + a.walkPhase)) * 0.06;
      if (ai.t <= 0) { a.faceHeading = null; a.model.torso.rotation.x = 0; setWalk(a, ai.i, ai.j, ai.c, rand() < 0.5 ? 1 : -1); }
    } else if (ai.type === 'cower') {
      a.wantVX = a.wantVZ = 0;
      a.faceHeading = Math.atan2(ai.fx - a.x, ai.fz - a.z) + Math.PI;
      ai.t -= dt;
      if (ai.t <= 0) { a.faceHeading = null; flee(a, ai.fx, ai.fz, 8); }
    } else if (ai.type === 'flee') {
      ai.t -= dt;
      a.faceHeading = null;
      const fx = ai.fx ?? G.player.x, fz = ai.fz ?? G.player.z;
      const dx = a.x - fx, dz = a.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      // run away, slightly zig-zagging
      const wob = Math.sin(G.time * 2 + a.walkPhase) * 0.35;
      const ux = dx / d, uz = dz / d;
      a.wantVX = (ux + uz * wob) * 6.4;
      a.wantVZ = (uz - ux * wob) * 6.4;
      if (ai.t <= 0) resumeWalking(a);
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

  // Dive out of the path of the player's speeding vehicle.
  function dodgeCars(a) {
    const P = G.player;
    if (P.mode !== 'car' || a.ai?.type === 'fight') return;
    const v = P.vehicle;
    if (v.speed < 7 || v.def.kind === 'boat') return;
    const dx = a.x - v.x, dz = a.z - v.z;
    if (Math.abs(dx) > 26 || Math.abs(dz) > 26) return;
    const ux = v.vx / v.speed, uz = v.vz / v.speed;
    const f = dx * ux + dz * uz;
    if (f < 0 || f > v.speed * 1.1 + 3) return;
    const lat = dx * uz - dz * ux;
    if (Math.abs(lat) > v.def.width / 2 + 1.6) return;
    if (a.dodgeT > G.time) return;
    a.dodgeT = G.time + 1.5;
    if (rand() < 0.2) return; // some freeze in the headlights
    const side = lat >= 0 ? 1 : -1;
    a.kx += uz * side * 7; a.kz += -ux * side * 7;
    a.vy = 2.5; a.grounded = false;
    flee(a, v.x, v.z, 5);
  }

  // Someone with a gun pointed at them either runs or drops and covers.
  function aimedAt(a, ray) {
    const P = G.player;
    if (a.ai?.type === 'flee' || a.ai?.type === 'cower' || a.ai?.type === 'fight') return;
    const dx = a.x - ray.ox, dy = a.y + 1.1 - ray.oy, dz = a.z - ray.oz;
    const t = dx * ray.dx + dy * ray.dy + dz * ray.dz;
    if (t < 0 || t > 35) return;
    const ex = dx - ray.dx * t, ey = dy - ray.dy * t, ez = dz - ray.dz * t;
    if (ex * ex + ey * ey + ez * ez > 1.2) return;
    if (rand() < 0.45) a.ai = { type: 'cower', t: 3 + rand() * 4, fx: P.x, fz: P.z };
    else flee(a, P.x, P.z, 9);
  }

  Pd.update = (dt) => {
    const P = G.player;
    timer -= dt;
    if (timer <= 0) {
      timer = 0.3;
      let n = 0;
      for (const a of G.actors.list) if (a.kind === 'ped' && !a.dead) n++;
      if (n < TARGET) spawnSomeone();
      for (const a of G.actors.list) {
        if (a.kind === 'ped' && !a.dead && !a.inVehicle && Math.hypot(a.x - P.x, a.z - P.z) > DESPAWN) G.actors.remove(a);
      }
    }
    const ray = P.aiming ? G.camera3.aimRay() : null;
    for (const a of G.actors.list) {
      if (a.kind !== 'ped' || a.dead || a.inVehicle) continue;
      think(a, dt);
      dodgeCars(a);
      if (ray) aimedAt(a, ray);
    }
    dogs.update(dt);
  };

  // ---- reactions
  G.events.on('gunshot', (attacker, x, z) => {
    for (const a of G.actors.list) {
      if (a.kind !== 'ped' || a.dead || a.inVehicle || a.ai?.type === 'fight') continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > 40) continue;
      if (a.ai?.type === 'cower') { a.ai.t = Math.max(a.ai.t, 2); continue; }
      if (d < 16 && rand() < 0.4) a.ai = { type: 'cower', t: 2.5 + rand() * 3, fx: x, fz: z };
      else flee(a, x, z, 7 + rand() * 5);
    }
  });
  G.events.on('explosion', (x, z) => {
    for (const a of G.actors.list) {
      if (a.kind !== 'ped' || a.dead) continue;
      if (Math.hypot(a.x - x, a.z - z) < 60) flee(a, x, z, 9);
    }
  });
  G.events.on('actorHit', (a, attacker) => {
    if (a.kind !== 'ped' || a.dead) return;
    if (attacker === G.player.actor || attacker === 'player') {
      if (G.player.weapon === 'fists' && rand() < 0.25) a.ai = { type: 'fight', t: 10, cool: 0.4 };
      else flee(a, G.player.x, G.player.z, 10);
    } else {
      a.ai = { type: 'flee', t: 8 };
    }
  });
  // nearby peds run when someone dies
  G.events.on('actorKilled', (a) => {
    if (a.kind !== 'ped') return;
    for (const o of G.actors.list) {
      if (o.kind === 'ped' && !o.dead && Math.hypot(o.x - a.x, o.z - a.z) < 22) flee(o, a.x, a.z, 8);
    }
  });

  return Pd;
}
