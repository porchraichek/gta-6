// Reusable AI driving: route along the road grid to a target point, avoid walls, recover when stuck.
import { clamp, angleDiff } from './random.js';
import { nearestNode, nodeX, nodeZ, route } from './roadnet.js';

// state: object kept per driven vehicle ({routeT, route, stuck, reverse}). Returns distance to target.
export function driveToward(G, v, state, tx0, tz0, opts = {}) {
  const dx = tx0 - v.x, dz = tz0 - v.z;
  const dist = Math.hypot(dx, dz);
  let tx = tx0, tz = tz0;
  const direct = dist < 60 && G.collision.lineOfSight(v.x, 1, v.z, tx0, 1, tz0);
  if (!direct) {
    state.routeT = (state.routeT ?? 0) - 1 / 60;
    if (!state.route || state.routeT <= 0 || state.routeTarget?.[0] !== tx0 || state.routeTarget?.[1] !== tz0) {
      state.routeT = 1;
      state.route = route(nearestNode(v.x, v.z), nearestNode(tx0, tz0));
      state.routeTarget = [tx0, tz0];
    }
    for (const n of state.route) {
      const wx = nodeX(n.i), wz = nodeZ(n.j);
      if (Math.hypot(wx - v.x, wz - v.z) > 15) { tx = wx; tz = wz; break; }
    }
  }
  let want = Math.atan2(tx - v.x, tz - v.z);
  const L = 8 + v.speed * 0.55;
  const ray = (a) => G.collision.rayDistance(v.x, 0.8, v.z, Math.sin(a), 0, Math.cos(a), L);
  const rc = ray(want), rl = ray(want + 0.55), rr = ray(want - 0.55);
  if (rc < L) want += rl > rr ? 0.9 : -0.9;
  else if (rl < L * 0.5) want -= 0.5;
  else if (rr < L * 0.5) want += 0.5;
  const err = angleDiff(v.heading, want);
  let steer = clamp(err * 2.2, -1, 1);
  let desired = (opts.speed ?? v.def.maxSpeed * 0.85);
  desired *= 1 - clamp((Math.abs(err) - 0.35) / 1.4, 0, 0.75);
  if (opts.slowNear && dist < opts.slowNear) desired = Math.min(desired, Math.max(3, dist * 0.6));
  if (v.speed < 1.2 && dist > 8) state.stuck = (state.stuck || 0) + 1 / 60; else state.stuck = Math.max(0, (state.stuck || 0) - 1 / 60);
  if (state.stuck > 1.5) { state.reverse = 1.2; state.stuck = 0; state.rdir = Math.random() < 0.5 ? 1 : -1; }
  let thr;
  if (state.reverse > 0) {
    state.reverse -= 1 / 60;
    thr = -1;
    steer = -steer * 0.8 + (state.rdir || 1) * 0.4;
  } else thr = clamp((desired - v.fwd) * 0.5, -1, 1);
  v.input.steer = steer;
  v.input.throttle = thr;
  v.input.handbrake = false;
  return dist;
}
