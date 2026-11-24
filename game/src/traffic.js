// Ambient traffic: cars that follow lanes through the intersection grid, obey signals, brake for obstacles, and parked cars to steal.
import { N, HALF, LANE, ROAD, CIVILIAN_CARS, CAR_COLORS } from './config.js';
import { rand, clamp, angleDiff } from './random.js';
import { DIRS, nodeX, nodeZ, nearestNode, lanePoint, lightState, randomRoadPoint, onRoad } from './roadnet.js';

const TARGET_MOVING = 26;
const TARGET_PARKED = 16;

export function createTraffic(G) {
  const T = { enabled: true, density: 1 };
  const spawnTimer = { t: 0 };

  function headingOfDir(d) {
    return d === 0 ? Math.PI / 2 : d === 1 ? -Math.PI / 2 : d === 2 ? 0 : Math.PI;
  }

  function initAI(v, i, j, d) {
    // car is on the lane leaving node (i,j) in direction d: next node is the neighbour
    let ti = i + DIRS[d].di, tj = j + DIRS[d].dj;
    if (ti < 0 || ti > N || tj < 0 || tj > N) {
      d = d ^ 1; // reverse if at the edge
      ti = i + DIRS[d].di; tj = j + DIRS[d].dj;
    }
    v.ai = { type: 'traffic', dir: d, ti, tj, nextDir: -1, cruise: 11 + rand() * 7, stuck: 0, honk: 0, patience: 0 };
    v.heading = headingOfDir(d);
    v.vx = Math.sin(v.heading) * 6; v.vz = Math.cos(v.heading) * 6;
  }

  function pickNextDir(ai) {
    const opts = [];
    const back = ai.dir ^ 1;
    for (let d = 0; d < 4; d++) {
      if (d === back) continue;
      const ni = ai.ti + DIRS[d].di, nj = ai.tj + DIRS[d].dj;
      if (ni < 0 || ni > N || nj < 0 || nj > N) continue;
      let w = d === ai.dir ? 5 : 1.4;
      opts.push([d, w]);
    }
    if (!opts.length) return back;
    let sum = opts.reduce((s, o) => s + o[1], 0), r = rand() * sum;
    for (const [d, w] of opts) { r -= w; if (r <= 0) return d; }
    return opts[0][0];
  }

  T.spawnMoving = (x, z, d, i, j, forceType) => {
    const type = forceType || (rand() < 0.04 ? 'cruiser' : CIVILIAN_CARS[Math.floor(rand() * CIVILIAN_CARS.length)]);
    const v = G.vehicles.spawn(type, x, z, headingOfDir(d), { color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], kind: type === 'cruiser' ? 'police' : 'civil', siren: false });
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
    const type = CIVILIAN_CARS[Math.floor(rand() * CIVILIAN_CARS.length)];
    const heading = along ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : off > 0 ? Math.PI : 0;
    const v = G.vehicles.spawn(type, x, z, heading, { color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
    v.parked = true;
  }

  T.update = (dt) => {
    const P = G.player;
    const list = G.vehicles.list;
    // spawn / despawn
    spawnTimer.t -= dt;
    if (spawnTimer.t <= 0 && T.enabled) {
      spawnTimer.t = 0.35;
      let moving = 0, parked = 0;
      for (const v of list) {
        if (v.ai?.type === 'traffic') moving++;
        else if (v.parked) parked++;
      }
      if (moving < TARGET_MOVING * T.density) {
        const p = randomRoadPoint(rand, P.x, P.z, 90, 210);
        if (p && sanePoint(p.x, p.z, 12) && offscreen(p.x, p.z)) T.spawnMoving(p.x, p.z, p.dir, p.i, p.j);
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

  function drive(v, dt) {
    const ai = v.ai;
    const px = v.x, pz = v.z;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const d = ai.dir;
    const nx = nodeX(ai.ti), nz = nodeZ(ai.tj);
    // distance along travel direction to the node centre (positive while approaching)
    const along = d === 0 ? nx - px : d === 1 ? px - nx : d === 2 ? nz - pz : pz - nz;
    const half = ROAD / 2;
    if (ai.nextDir < 0 && along < 16) ai.nextDir = pickNextDir(ai);
    let tx, tz;
    if (ai.nextDir >= 0 && along < 14) {
      const nd = ai.nextDir;
      const outPt = lanePoint(ai.ti, ai.tj, nd, half + 6);
      if (nd === d) {
        // straight: aim along the lane
        const lp = lanePoint(ai.ti, ai.tj, d, 14);
        tx = lp[0]; tz = lp[1];
      } else {
        const lp = lanePoint(ai.ti, ai.tj, nd, nd === (d ^ 1) ? half : half + 3);
        tx = outPt[0]; tz = outPt[1];
        void lp;
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
      // lane line is lp's perpendicular coordinate; target is `look` ahead of the car on that line
      if (d < 2) { tx = px + (d === 0 ? look : -look); tz = lp[1]; }
      else { tx = lp[0]; tz = pz + (d === 2 ? look : -look); }
    }
    // pure pursuit
    const want = Math.atan2(tx - px, tz - pz);
    const err = angleDiff(v.heading, want);
    v.input.steer = clamp(err * 1.9, -1, 1);

    // speed target
    let desired = ai.cruise;
    const turning = ai.nextDir >= 0 && ai.nextDir !== d && along < 24;
    if (turning) desired = Math.min(desired, 7);
    desired *= 1 - clamp(Math.abs(err) / 1.6, 0, 0.7);

    // obstacle scan ahead
    const scan = 7 + v.speed * 1.5;
    let gap = Infinity;
    for (const o of G.vehicles.list) {
      if (o === v || o.removed) continue;
      const dx = o.x - px, dz = o.z - pz;
      const f = dx * s + dz * c;
      if (f < 0 || f > scan + 4) continue;
      const l = Math.abs(dx * c - dz * s);
      if (l < (v.def.width + o.def.width) / 2 + 0.6) gap = Math.min(gap, f - (v.def.length + o.def.length) / 2);
    }
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle) continue;
      const dx = a.x - px, dz = a.z - pz;
      const f = dx * s + dz * c;
      if (f < 0 || f > scan) continue;
      const l = Math.abs(dx * c - dz * s);
      if (l < v.def.width / 2 + 0.9) gap = Math.min(gap, f - v.def.length / 2);
    }
    // traffic light
    if (along > half + 0.5 && ai.nextDir !== -2) {
      const axis = d < 2 ? 'x' : 'z';
      const st = lightState(ai.ti, ai.tj, axis, G.time);
      if (st !== 'green') {
        const stop = along - half - 1.8;
        const canStop = stop > v.speed * v.speed / 14;
        if (st === 'red' || canStop) { if (stop < scan + 10) gap = Math.min(gap, stop); }
      }
    }
    if (gap < Infinity) {
      if (gap < 3) desired = 0;
      else desired = Math.min(desired, Math.sqrt(Math.max(0, gap - 2)) * 3.2);
    }
    const dv = desired - v.fwd;
    v.input.throttle = clamp(dv * 0.5, -1, 0.9);
    if (desired < 0.1 && v.fwd < 0.6) v.input.throttle = 0;
    v.input.handbrake = desired === 0 && v.speed < 1;
    // stuck recovery
    if (v.speed < 0.6 && gap === Infinity) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 5) resnap(v);
    // off the road entirely (after a crash): re-snap
    if (!onRoad(px, pz, 1)) { ai.off = (ai.off || 0) + dt; if (ai.off > 3) resnap(v); } else ai.off = 0;
    // honk at pedestrians or blocked cars
    if (gap < 5 && v.speed < 1) { ai.honk += dt; if (ai.honk > 2.5) { ai.honk = 0; G.audio?.horn(false); } }
  }

  function turnedEnough(v, nd) {
    const target = headingOfDir(nd);
    return Math.abs(angleDiff(v.heading, target)) < 0.5;
  }

  function resnap(v) {
    const n = nearestNode(v.x, v.z);
    // choose the direction closest to our heading
    let best = 0, bd = 9;
    for (let d = 0; d < 4; d++) {
      const diff = Math.abs(angleDiff(v.heading, headingOfDir(d)));
      if (diff < bd) { bd = diff; best = d; }
    }
    const lp = lanePoint(n.i, n.j, best, 0);
    const ok = best < 2 ? Math.abs(v.z - lp[1]) < 7 : Math.abs(v.x - lp[0]) < 7;
    initAI(v, n.i, n.j, best);
    // if the next node is behind the car, flip to the following node
    void ok;
    v.ai.cruise = 10 + rand() * 6;
  }

  T.initAI = initAI;
  T.resnap = resnap;
  return T;
}
