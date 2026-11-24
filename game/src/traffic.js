// Ambient traffic: varied vehicles that follow lanes through the intersection grid, obey signals and brake for obstacles;
// drivers honk and swerve at a reckless player, panic and speed off (or bail out) at gunfire, and parked cars line the kerbs.
import { N, HALF, ROAD } from './config.js';
import { rand, clamp, angleDiff } from './random.js';
import { DIRS, nodeX, nodeZ, nearestNode, lanePoint, lightState, randomRoadPoint, onRoad } from './roadnet.js';
import { TRAFFIC_POOL, PARKED_POOL, pickWeighted, pickPaint } from './vehicleDefs.js';

const TARGET_MOVING = 38;
const TARGET_PARKED = 22;
const HONK_RANGE = 45; // only cars this close to the player are audible
const PANIC_TIME = 9;

export function createTraffic(G) {
  const T = { enabled: true, density: 1 };
  const spawnTimer = { t: 0 };
  let honkGate = 0; // global limiter so a jam does not become a wall of horns

  function headingOfDir(d) {
    return d === 0 ? Math.PI / 2 : d === 1 ? -Math.PI / 2 : d === 2 ? 0 : Math.PI;
  }

  function baseCruise(v) {
    if (v.type === 'bus') return 8 + rand() * 3;
    if (v.def.kind === 'bike' || v.type === 'sports' || v.type === 'supercar' || v.type === 'muscle') return 13 + rand() * 8;
    return 11 + rand() * 7;
  }

  function initAI(v, i, j, d) {
    // car is on the lane leaving node (i,j) in direction d: next node is the neighbour
    let ti = i + DIRS[d].di, tj = j + DIRS[d].dj;
    if (ti < 0 || ti > N || tj < 0 || tj > N) {
      d = d ^ 1; // reverse if at the edge
      ti = i + DIRS[d].di; tj = j + DIRS[d].dj;
    }
    v.ai = { type: 'traffic', dir: d, ti, tj, nextDir: -1, cruise: baseCruise(v), stuck: 0, honk: 0, patience: 0, panic: 0, swerve: 0, swerveT: 0, honkCd: 0 };
    v.heading = headingOfDir(d);
    v.angVel = 0;
    v.vx = Math.sin(v.heading) * 6; v.vz = Math.cos(v.heading) * 6;
  }

  function pickNextDir(ai) {
    const opts = [];
    const back = ai.dir ^ 1;
    for (let d = 0; d < 4; d++) {
      if (d === back) continue;
      const ni = ai.ti + DIRS[d].di, nj = ai.tj + DIRS[d].dj;
      if (ni < 0 || ni > N || nj < 0 || nj > N) continue;
      opts.push([d, d === ai.dir ? 5 : 1.4]);
    }
    if (!opts.length) return back;
    let sum = opts.reduce((s, o) => s + o[1], 0), r = rand() * sum;
    for (const [d, w] of opts) { r -= w; if (r <= 0) return d; }
    return opts[0][0];
  }

  T.spawnMoving = (x, z, d, i, j, forceType) => {
    const type = forceType || (rand() < 0.035 ? 'cruiser' : pickWeighted(TRAFFIC_POOL, rand));
    const police = type === 'cruiser';
    const v = G.vehicles.spawn(type, x, z, headingOfDir(d), { color: police ? 0x1b2d52 : pickPaint(type, rand), kind: police ? 'police' : 'civil', siren: false });
    v.driver = 'ai';
    v.sirenOn = false;
    initAI(v, i, j, d);
    return v;
  };

  function sanePoint(x, z, r) {
    for (const v of G.vehicles.list) if (Math.hypot(v.x - x, v.z - z) < r) return false;
    return true;
  }

  function offscreen(x, z) {
    const cam = G.camera3.camera.position;
    const dx = x - cam.x, dz = z - cam.z;
    const d = Math.hypot(dx, dz);
    if (d > 140) return true;
    const cy = G.camera3.yaw;
    const dot = (dx * Math.sin(cy) + dz * Math.cos(cy)) / (d || 1);
    return dot < 0.2;
  }

  function spawnParked() {
    const p = randomRoadPoint(rand, G.player.x, G.player.z, 60, 190);
    if (!p) return;
    // park at the kerb: shift to road edge
    const along = p.dir < 2;
    const off = (rand() < 0.5 ? 1 : -1) * 7.3;
    const x = along ? p.x : nodeX(p.i) + off;
    const z = along ? nodeZ(p.j) + off : p.z;
    if (!onRoad(x, z) || !sanePoint(x, z, 7) || !offscreen(x, z)) return;
    // keep clear of intersections
    const fx = (x + HALF) / 90, fz = (z + HALF) / 90;
    if (Math.abs(fx - Math.round(fx)) * 90 < 12 && Math.abs(fz - Math.round(fz)) * 90 < 12) return;
    const type = pickWeighted(PARKED_POOL, rand);
    const heading = along ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : off > 0 ? Math.PI : 0;
    const v = G.vehicles.spawn(type, x, z, heading, { color: pickPaint(type, rand) });
    v.parked = true;
    v.input.handbrake = true;
  }

  function honk(v) {
    const ai = v.ai;
    if (ai.honkCd > 0 || G.time < honkGate) return;
    if (Math.hypot(v.x - G.player.x, v.z - G.player.z) > HONK_RANGE) return;
    ai.honkCd = 2 + rand() * 2;
    honkGate = G.time + 0.4;
    G.audio?.horn(rand() < 0.5);
  }

  function panic(v, sx, sz) {
    const ai = v.ai;
    if (!ai || ai.type !== 'traffic' || v.driver !== 'ai') return;
    ai.panic = PANIC_TIME + rand() * 4;
    ai.fearX = sx; ai.fearZ = sz;
    if (rand() < 0.5) honk(v);
  }

  // Driver abandons the car and runs (stopped at a light or stuck in a jam when the shooting starts).
  function bailOut(v, sx, sz) {
    if (!G.pedestrians?.spawnAt) return;
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    const a = G.pedestrians.spawnAt(v.x + lx * (v.def.width / 2 + 0.8), v.z + lz * (v.def.width / 2 + 0.8));
    a.ai = { type: 'flee', t: 12, fx: sx, fz: sz };
    v.driver = null;
    v.ai = null;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
  }

  T.update = (dt) => {
    const P = G.player;
    const list = G.vehicles.list;
    // spawn / despawn
    spawnTimer.t -= dt;
    if (spawnTimer.t <= 0 && T.enabled) {
      spawnTimer.t = 0.25;
      let moving = 0, parked = 0;
      for (const v of list) {
        if (v.ai?.type === 'traffic') moving++;
        else if (v.parked) parked++;
      }
      if (moving < TARGET_MOVING * T.density) {
        const p = randomRoadPoint(rand, P.x, P.z, 90, 210);
        if (p && sanePoint(p.x, p.z, 14) && offscreen(p.x, p.z)) T.spawnMoving(p.x, p.z, p.dir, p.i, p.j);
      }
      if (parked < TARGET_PARKED * T.density) spawnParked();
    }
    for (let k = list.length - 1; k >= 0; k--) {
      const v = list[k];
      if (v.mission || v.driver === 'player' || v.playerOwned && Math.hypot(v.x - P.x, v.z - P.z) < 400) continue;
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      if ((v.ai?.type === 'traffic' || v.parked || (v.dead && v.wreckAge > 30) || (!v.ai && !v.driver)) && (d > 260 || (v.dead && v.wreckAge > 40 && d > 60))) {
        if (v.occupant) G.actors.remove(v.occupant);
        G.vehicles.remove(v);
      }
    }
    for (const v of list) {
      if (v.ai?.type === 'traffic' && !v.dead && v.driver === 'ai') drive(v, dt);
    }
  };

  // Is the player's vehicle about to hit this car? Returns the lateral side of the threat (+1 left) or 0.
  function playerThreat(v) {
    const P = G.player;
    if (P.mode !== 'car' || P.vehicle === v) return 0;
    const pv = P.vehicle;
    const dx = pv.x - v.x, dz = pv.z - v.z;
    const d = Math.hypot(dx, dz);
    if (d > 32 || d < 0.1 || pv.speed < 8) return 0;
    const closing = -(dx * (pv.vx - v.vx) + dz * (pv.vz - v.vz)) / d;
    if (closing < 8 || d / closing > 1.5) return 0;
    const lat = dx * Math.cos(v.heading) - dz * Math.sin(v.heading);
    return lat >= 0 ? 1 : -1;
  }

  function drive(v, dt) {
    const ai = v.ai;
    const px = v.x, pz = v.z;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const d = ai.dir;
    const nx = nodeX(ai.ti), nz = nodeZ(ai.tj);
    ai.honkCd -= dt;
    if (ai.panic > 0) ai.panic -= dt;
    const panicking = ai.panic > 0;
    // distance along travel direction to the node centre (positive while approaching)
    const along = d === 0 ? nx - px : d === 1 ? px - nx : d === 2 ? nz - pz : pz - nz;
    const half = ROAD / 2;
    if (ai.nextDir < 0 && along < 16) ai.nextDir = pickNextDir(ai);
    let tx, tz;
    if (ai.nextDir >= 0 && along < 14) {
      const nd = ai.nextDir;
      if (nd === d) {
        const lp = lanePoint(ai.ti, ai.tj, d, 14);
        tx = lp[0]; tz = lp[1];
      } else {
        const outPt = lanePoint(ai.ti, ai.tj, nd, half + 6);
        tx = outPt[0]; tz = outPt[1];
      }
      // handover when past the centre
      if (along < -2.5 || (ai.nextDir !== d && along < half * 0.2 && Math.hypot(px - nx, pz - nz) < half * 0.7 && turnedEnough(v, nd))) {
        ai.dir = ai.nextDir;
        ai.ti += DIRS[ai.dir].di; ai.tj += DIRS[ai.dir].dj;
        ai.nextDir = -1;
        if (ai.ti < 0 || ai.ti > N || ai.tj < 0 || ai.tj > N) {
          ai.ti -= DIRS[ai.dir].di; ai.tj -= DIRS[ai.dir].dj;
          ai.dir ^= 1;
          ai.ti += DIRS[ai.dir].di; ai.tj += DIRS[ai.dir].dj;
        }
      }
    } else {
      // follow the current lane towards the node
      const look = 9 + v.speed * 0.5;
      const lp = lanePoint(ai.ti, ai.tj, d, 0);
      if (d < 2) { tx = px + (d === 0 ? look : -look); tz = lp[1]; }
      else { tx = lp[0]; tz = pz + (d === 2 ? look : -look); }
    }
    // pure pursuit
    const want = Math.atan2(tx - px, tz - pz);
    const err = angleDiff(v.heading, want);
    v.input.steer = clamp(err * 1.9, -1, 1);

    // speed target
    let desired = panicking ? Math.max(ai.cruise * 1.7, v.def.maxSpeed * 0.6) : ai.cruise;
    const turning = ai.nextDir >= 0 && ai.nextDir !== d && along < 24;
    if (turning) desired = Math.min(desired, panicking ? 10 : 7);
    desired *= 1 - clamp(Math.abs(err) / 1.6, 0, 0.7);

    // obstacle scan ahead (a car that has been blocked for a while ghosts through jams)
    const scan = 7 + v.speed * 1.5;
    let gap = Infinity, blocker = null;
    if (ai.ghostT > 0) ai.ghostT -= dt;
    v.ghost = ai.ghostT > 0;
    for (const o of G.vehicles.list) {
      if (o === v || o.removed || (v.ghost && o.driver !== 'player')) continue;
      const dx = o.x - px, dz = o.z - pz;
      const f = dx * s + dz * c;
      if (f < 0 || f > scan + 6) continue;
      const l = Math.abs(dx * c - dz * s);
      if (l < (v.def.width + o.def.width) / 2 + 0.6) {
        const g = f - (v.def.length + o.def.length) / 2;
        if (g < gap) { gap = g; blocker = o; }
      }
    }
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle) continue;
      const dx = a.x - px, dz = a.z - pz;
      const f = dx * s + dz * c;
      if (f < 0 || f > scan) continue;
      const l = Math.abs(dx * c - dz * s);
      if (l < v.def.width / 2 + 0.9) {
        const g = f - v.def.length / 2;
        if (g < gap) { gap = g; blocker = a; }
      }
    }
    // traffic light (panicking drivers run reds)
    if (!panicking && along > half + 0.5) {
      const axis = d < 2 ? 'x' : 'z';
      const st = lightState(ai.ti, ai.tj, axis, G.time);
      if (st !== 'green') {
        const stop = along - half - 1.8;
        const canStop = stop > v.speed * v.speed / 14;
        if (st === 'red' || canStop) { if (stop < scan + 10) { gap = Math.min(gap, stop); if (gap === stop) blocker = null; } }
      }
    }
    if (gap < Infinity) {
      if (gap < 3) desired = 0;
      else desired = Math.min(desired, Math.sqrt(Math.max(0, gap - 2)) * 3.2);
    }

    // react to a reckless player: horn, swerve away, stand on the brakes
    const threat = playerThreat(v);
    if (threat && ai.swerveT <= 0) {
      ai.swerve = -threat;
      ai.swerveT = 0.8 + rand() * 0.5;
      honk(v);
      if (rand() < 0.25) ai.panic = Math.max(ai.panic, 4);
    }
    if (ai.swerveT > 0) {
      ai.swerveT -= dt;
      v.input.steer = clamp(v.input.steer + ai.swerve * 0.75, -1, 1);
      desired = Math.min(desired, v.speed * 0.5);
    }

    const dv = desired - v.fwd;
    v.input.throttle = clamp(dv * 0.5, -1, panicking ? 1 : 0.9);
    if (desired < 0.1 && v.fwd < 0.6) v.input.throttle = 0;
    v.input.handbrake = desired === 0 && v.speed < 1;
    if (v.speed < 0.6 && gap < Infinity) ai.blockedT = (ai.blockedT || 0) + dt; else ai.blockedT = 0;
    if (ai.blockedT > 6) { ai.ghostT = 5; ai.blockedT = 0; }
    // stuck recovery
    if (v.speed < 0.6 && gap === Infinity) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 5) resnap(v);
    // off the road entirely (after a crash): re-snap
    if (!onRoad(px, pz, 1)) { ai.off = (ai.off || 0) + dt; if (ai.off > 3) resnap(v); } else ai.off = 0;
    // horn at whatever is blocking us (the player gets less patience)
    if (gap < 5 && v.speed < 1 && blocker) {
      ai.honk += dt * (blocker === G.player.actor || blocker.driver === 'player' ? 2 : 1);
      if (ai.honk > 2.5) { ai.honk = 0; honk(v); }
    }
    if (panicking && rand() < dt * 0.4) honk(v);
  }

  function turnedEnough(v, nd) {
    return Math.abs(angleDiff(v.heading, headingOfDir(nd))) < 0.5;
  }

  function resnap(v) {
    const n = nearestNode(v.x, v.z);
    let best = 0, bd = 9;
    for (let d = 0; d < 4; d++) {
      const diff = Math.abs(angleDiff(v.heading, headingOfDir(d)));
      if (diff < bd) { bd = diff; best = d; }
    }
    const keepPanic = v.ai?.panic || 0;
    initAI(v, n.i, n.j, best);
    v.ai.cruise = 10 + rand() * 6;
    v.ai.panic = keepPanic;
  }

  // ---- reactions to danger
  function scare(x, z, radius, bailRadius) {
    for (const v of G.vehicles.list) {
      if (v.ai?.type !== 'traffic' || v.driver !== 'ai' || v.dead) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > radius) continue;
      if (d < bailRadius && v.speed < 4 && rand() < 0.4) bailOut(v, x, z);
      else panic(v, x, z);
    }
  }
  G.events.on('gunshot', (attacker, x, z) => scare(x, z, 45, 20));
  G.events.on('explosion', (x, z) => scare(x, z, 70, 30));
  G.events.on('carjack', (v) => scare(v.x, v.z, 30, 0));
  G.events.on('vehicleCollision', (A, B, imp) => {
    for (const [me, other] of [[A, B], [B, A]]) {
      if (other.driver !== 'player' || me.ai?.type !== 'traffic' || me.driver !== 'ai') continue;
      if (imp > 12 || rand() < 0.4) panic(me, other.x, other.z);
      else honk(me);
    }
  });

  T.initAI = initAI;
  T.resnap = resnap;
  return T;
}
