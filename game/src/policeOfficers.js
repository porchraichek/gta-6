// Officers on foot: patrol the sidewalks when calm, hold roadblock positions, chase and arrest, shoot from 2 stars,
// and comb the search area when the suspect has slipped out of sight.
import { rand } from './random.js';
import { officerSees, sightRangeScale } from './policeSight.js';

const PATROL_SPEED = 1.5, SEARCH_SPEED = 3.2;
const WEAPON_STATS = {
  pistol: { range: 18, cool: () => 0.85 + rand() * 0.5, dmg: 6.5, carDmg: 4 },
  smg: { range: 24, cool: () => 0.22, dmg: 4.5, carDmg: 3 },
  shotgun: { range: 14, cool: () => 1.1, dmg: 13, carDmg: 7 },
};

export function createOfficerBrain(G) {
  // walk towards (tx, tz), sliding around walls with a short whisker
  function walkTo(a, tx, tz, speed) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { a.wantVX = a.wantVZ = 0; return d; }
    let mx = dx / d, mz = dz / d;
    if (G.collision.rayDistance(a.x, 0.9, a.z, mx, 0, mz, 3) < 3) {
      const left = G.collision.rayDistance(a.x, 0.9, a.z, -mz, 0, mx, 4), right = G.collision.rayDistance(a.x, 0.9, a.z, mz, 0, -mx, 4);
      const side = left > right ? 1 : -1;
      const ox = mx, oz = mz;
      mx = -oz * side * 0.9 + ox * 0.2; mz = ox * side * 0.9 + oz * 0.2;
    }
    a.wantVX = mx * speed;
    a.wantVZ = mz * speed;
    return d;
  }

  function patrol(a, dt) {
    const ai = a.ai;
    ai.turnT = (ai.turnT ?? 0) - dt;
    if (ai.patrolDir === undefined || ai.turnT <= 0) {
      ai.patrolDir = (ai.patrolDir ?? a.heading) + (rand() < 0.5 ? 1 : -1) * (Math.PI / 2) * (rand() < 0.3 ? 2 : 1);
      ai.turnT = 6 + rand() * 8;
    }
    const mx = Math.sin(ai.patrolDir), mz = Math.cos(ai.patrolDir);
    if (G.collision.rayDistance(a.x, 0.9, a.z, mx, 0, mz, 2.5) < 2.5) { ai.turnT = 0; a.wantVX = a.wantVZ = 0; return; }
    a.wantVX = mx * PATROL_SPEED;
    a.wantVZ = mz * PATROL_SPEED;
  }

  function search(a, dt) {
    const ai = a.ai, s = G.wanted.search;
    ai.searchT = (ai.searchT ?? 0) - dt;
    const off = ai.searchPt ? Math.hypot(ai.searchPt.x - s.x, ai.searchPt.z - s.z) > s.radius : true;
    if (!ai.searchPt || ai.searchT <= 0 || off) {
      const ang = rand() * Math.PI * 2, r = Math.sqrt(rand()) * s.radius * 0.8;
      ai.searchPt = { x: s.x + Math.cos(ang) * r, z: s.z + Math.sin(ang) * r };
      ai.searchT = 7 + rand() * 6;
    }
    if (walkTo(a, ai.searchPt.x, ai.searchPt.z, SEARCH_SPEED) < 2) ai.searchT = Math.min(ai.searchT, 1.2 + rand());
  }

  function shoot(a, dist, dx, dz) {
    const P = G.player, ai = a.ai, W = G.wanted;
    const ws = WEAPON_STATS[a.weapon] || WEAPON_STATS.pistol;
    ai.cool = ws.cool();
    const acc = 0.22 + W.stars * 0.04 + (ai.swat ? 0.08 : 0) - (P.mode === 'car' ? 0.12 : 0) - Math.min(0.2, dist * 0.005);
    const sy = a.y + 1.35, ty = P.y + 1.0;
    const hit = rand() < acc;
    const ex = P.x + (hit ? 0 : (rand() - 0.5) * 5), ez = P.z + (hit ? 0 : (rand() - 0.5) * 5);
    G.fx.tracer(a.x + (dx / dist) * 0.8, sy, a.z + (dz / dist) * 0.8, ex, hit ? ty : 0.6, ez);
    G.fx.muzzle(a.x + (dx / dist) * 0.9, sy, a.z + (dz / dist) * 0.9, dx / dist, dz / dist);
    G.audio?.gunshot(a.weapon, a.x, a.z);
    a.fired = 0.15;
    if (!hit) return;
    if (P.mode === 'car') { G.vehicles.damage(P.vehicle, ws.carDmg, a); P.takeDamage(1.2, a); }
    else P.takeDamage(ws.dmg, a, { dirX: dx / dist, dirZ: dz / dist });
  }

  // one frame of thinking for a foot officer; `level` is the current escalation entry (null when calm)
  return function think(a, dt, level) {
    const P = G.player, W = G.wanted, ai = a.ai;
    const dx = P.x - a.x, dz = P.z - a.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    a.aiming = false;
    a.faceHeading = null;
    ai.cool -= dt;

    if (!level) {
      ai.sees = false;
      if (ai.patrol) patrol(a, dt);
      else { a.wantVX = a.wantVZ = 0; ai.idle = (ai.idle || 0) + dt; }
      return;
    }
    ai.idle = 0;
    // eyes: throttled cone-of-vision check
    ai.spotT = (ai.spotT ?? rand() * 0.3) - dt;
    if (ai.spotT <= 0) {
      ai.spotT = 0.25 + rand() * 0.1;
      ai.sees = !P.dead && officerSees(G, a, P.x, P.y + 1.2, P.z, sightRangeScale(G));
    }
    if (ai.sees) W.spot();

    // roadblock guards stay in cover until the suspect is close
    if (ai.hold) {
      if (dist > 34) {
        walkTo(a, ai.hold.x, ai.hold.z, 3);
        a.faceHeading = Math.atan2(dx, dz);
        a.aiming = a.weapon !== 'fists' && dist < 60;
        if (a.aiming && ai.sees && level.shoot && dist < 45 && ai.cool <= 0) shoot(a, dist, dx, dz);
        return;
      }
      ai.hold = null;
    }
    if (W.search.active && !ai.sees) { search(a, dt); return; }

    const armed = a.weapon !== 'fists';
    const ws = WEAPON_STATS[a.weapon] || WEAPON_STATS.pistol;
    const shootOk = armed && (level.shoot || ai.swat || (P.aiming && dist < 20));
    const chaseSpeed = ai.swat ? 5.6 : 5.0 + W.stars * 0.4;
    if (P.mode === 'car' && P.vehicle.speed > 14 && dist > 20 && !shootOk) { a.wantVX = a.wantVZ = 0; return; }
    if (shootOk && ai.sees && dist < ws.range && dist > 5) {
      a.aiming = true;
      a.faceHeading = Math.atan2(dx, dz);
      const px = -dz / dist, pz = dx / dist, fwd = dist > 11 ? 1.6 : -0.6;
      a.wantVX = px * ai.strafe * 2.2 + (dx / dist) * fwd;
      a.wantVZ = pz * ai.strafe * 2.2 + (dz / dist) * fwd;
      if (rand() < dt * 0.4) ai.strafe *= -1;
      if (ai.cool <= 0) shoot(a, dist, dx, dz);
    } else if (dist > 1.6) {
      // run to where the suspect is (or was last seen during the grace period)
      const tx = ai.sees ? P.x : W.lastSeen.x, tz = ai.sees ? P.z : W.lastSeen.z;
      walkTo(a, tx, tz, chaseSpeed);
    } else {
      a.wantVX = a.wantVZ = 0;
      a.faceHeading = Math.atan2(dx, dz);
      if (ai.cool <= 0 && P.mode === 'foot' && (level.shoot || P.aiming)) {
        ai.cool = 0.8;
        a.punchT = 0.28;
        a.punchSide = !a.punchSide;
        P.takeDamage(4, a, { dirX: (dx / dist) * 1.5, dirZ: (dz / dist) * 1.5 });
      }
    }
  };
}
