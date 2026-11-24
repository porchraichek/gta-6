// Police vehicle driving: route-following pursuit, tailing at 1 star, ramming and PIT manoeuvres from 2 stars,
// drive-by fire from 3, and slow sweeps of the search area once the suspect is out of sight.
import { rand, clamp, angleDiff } from './random.js';
import { nearestNode, nodeX, nodeZ, route, randomRoadPoint } from './roadnet.js';
import { cruiserSees, sightRangeScale } from './policeSight.js';

const DEPLOY_RANGE = { cruiser: 28, swat: 36 };

export function createPoliceDriver(G, hooks) {
  // steer and throttle towards (tx, tz): straight at it when visible, otherwise along a grid route
  function driveTo(v, tx, tz, desired, dt) {
    const ai = v.ai;
    const dist = Math.hypot(tx - v.x, tz - v.z);
    ai.losT = (ai.losT ?? 0) - dt;
    if (ai.losT <= 0) {
      ai.losT = 0.3;
      ai.direct = dist < 70 && G.collision.lineOfSight(v.x, 1, v.z, tx, 1, tz);
    }
    let ax = tx, az = tz;
    if (!ai.direct) {
      const goal = nearestNode(tx, tz);
      ai.routeT = (ai.routeT ?? 0) - dt;
      if (ai.routeT <= 0 || !ai.goal || ai.goal.i !== goal.i || ai.goal.j !== goal.j) {
        ai.routeT = 1;
        ai.goal = goal;
        ai.route = route(nearestNode(v.x, v.z), goal);
      }
      for (const n of ai.route) {
        const wx = nodeX(n.i), wz = nodeZ(n.j);
        if (Math.hypot(wx - v.x, wz - v.z) > 16) { ax = wx; az = wz; break; }
      }
    }
    let want = Math.atan2(ax - v.x, az - v.z);
    // whisker obstacle avoidance
    const L = 8 + v.speed * 0.55;
    const ray = (a) => G.collision.rayDistance(v.x, 0.8, v.z, Math.sin(a), 0, Math.cos(a), L);
    const rc = ray(want), rl = ray(want + 0.55), rr = ray(want - 0.55);
    if (rc < L) want += rl > rr ? 0.9 : -0.9;
    else if (rl < L * 0.5) want -= 0.5;
    else if (rr < L * 0.5) want += 0.5;
    const err = angleDiff(v.heading, want);
    let steer = clamp(err * 2.2, -1, 1);
    desired *= 1 - clamp((Math.abs(err) - 0.35) / 1.4, 0, 0.75);
    // stuck detection and a reverse manoeuvre
    if (v.speed < 1.2 && dist > 9 && desired > 2) ai.stuck = (ai.stuck || 0) + dt; else ai.stuck = Math.max(0, (ai.stuck || 0) - dt);
    if (ai.stuck > 1.6) { ai.reverse = 1.3; ai.stuck = 0; ai.rdir = rand() < 0.5 ? 1 : -1; }
    let thr;
    if (ai.reverse > 0) {
      ai.reverse -= dt;
      thr = -1;
      steer = -steer * 0.8 + ai.rdir * 0.4;
    } else thr = clamp((desired - v.fwd) * 0.5, -1, 1);
    v.input.steer = steer;
    v.input.throttle = thr;
    v.input.handbrake = false;
    return dist;
  }

  function sweepSearchArea(v, dt) {
    const ai = v.ai, s = G.wanted.search;
    ai.searchT = (ai.searchT ?? 0) - dt;
    const pt = ai.searchPt;
    if (!pt || ai.searchT <= 0 || Math.hypot(pt.x - v.x, pt.z - v.z) < 12 || Math.hypot(pt.x - s.x, pt.z - s.z) > s.radius + 20) {
      ai.searchPt = randomRoadPoint(rand, s.x, s.z, 0, s.radius) || { x: s.x, z: s.z };
      ai.searchT = 14;
    }
    driveTo(v, ai.searchPt.x, ai.searchPt.z, v.def.maxSpeed * 0.42, dt);
  }

  function driveBy(v, dt, dist) {
    const P = G.player, ai = v.ai;
    ai.shootT = (ai.shootT ?? 1) - dt;
    if (ai.shootT > 0 || dist > 30) return;
    ai.shootT = 0.9 + rand() * 0.6;
    if (!G.collision.lineOfSight(v.x, 1.2, v.z, P.x, 1, P.z)) return;
    G.fx.tracer(v.x, 1.2, v.z, P.x + (rand() - 0.5) * 2, 1, P.z + (rand() - 0.5) * 2);
    G.audio?.gunshot('pistol', v.x, v.z);
    if (rand() < 0.4) { G.vehicles.damage(P.vehicle, 5, 'police'); P.takeDamage(1.5, 'police'); }
  }

  return function drive(v, dt, level) {
    const P = G.player, W = G.wanted, ai = v.ai;
    ai.spotT = (ai.spotT ?? rand() * 0.3) - dt;
    if (ai.spotT <= 0) {
      ai.spotT = 0.3;
      ai.sees = !P.dead && v.occupant !== null && cruiserSees(G, v, P.x, P.y + 1.2, P.z, sightRangeScale(G));
    }
    if (ai.sees) W.spot();
    ai.pitting = false;
    if (W.search.active && !ai.sees) { sweepSearchArea(v, dt); return; }

    const pv = P.mode === 'car' ? P.vehicle : null;
    const dist = Math.hypot(P.x - v.x, P.z - v.z);
    let tx = ai.sees ? P.x : W.lastSeen.x, tz = ai.sees ? P.z : W.lastSeen.z;
    let desired = v.def.maxSpeed * (level.heavy ? 0.95 : 0.86);
    if (pv && ai.sees) {
      const fx = Math.sin(pv.heading), fz = Math.cos(pv.heading), lx = fz, lz = -fx;
      if (!level.ram) {
        // 1 star: tail the suspect at a respectful distance
        if (dist < 30) {
          tx = P.x - fx * 11; tz = P.z - fz * 11;
          desired = clamp(pv.speed + (dist - 12) * 0.8, 0, desired);
        }
      } else {
        tx += pv.vx * 0.35; tz += pv.vz * 0.35;
        const rx = v.x - P.x, rz = v.z - P.z;
        const along = rx * fx + rz * fz;
        if (pv.speed > 8 && dist < 18 && along < 2 && along > -14) {
          // PIT: nudge the rear quarter on our side to spin the suspect out
          const side = rx * lx + rz * lz >= 0 ? 1 : -1;
          ai.pitting = true;
          ai.pitSide = side;
          tx = P.x - fx * 1.8 + lx * side * 1.2; tz = P.z - fz * 1.8 + lz * side * 1.2;
          desired = pv.speed + 6;
        } else if (dist < 14) desired = Math.max(desired * 0.8, pv.speed + 6);
      }
    }
    if (!pv && dist < 16) desired = Math.min(desired, 5);
    driveTo(v, tx, tz, desired, dt);

    // officers get out: suspect on foot nearby, or a stopped car
    const range = DEPLOY_RANGE[v.type] || 28;
    const stopped = pv && pv.speed < (v.type === 'swat' ? 5 : 2);
    if (v.occupant && !v.occupant.dead && dist < range && v.speed < 9 && (!pv || (stopped && dist < (level.ram ? range : 12)))) hooks.deploy(v);
    if (level.driveBy && pv && ai.sees && v.occupant && !v.occupant.dead) driveBy(v, dt, dist);
  };
}
