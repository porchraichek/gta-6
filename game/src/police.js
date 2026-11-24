// Police response: cruisers and SWAT vans that route to and ram the player, foot cops that arrest or shoot, and a helicopter.
import * as THREE from 'three';
import { rand, clamp, angleDiff } from './random.js';
import { GeoBuilder } from './geomkit.js';
import { N, HALF } from './config.js';
import { nearestNode, nodeX, nodeZ, route, randomRoadPoint, onRoad } from './roadnet.js';

const CRUISERS = [0, 2, 3, 4, 5, 6];
const FOOT = [0, 1, 3, 4, 5, 6];
const SWAT_VANS = [0, 0, 0, 1, 1, 2];

export function createPolice(G) {
  const Po = { heli: null, bustT: 0 };
  let spawnT = 0;
  const copOutfit = () => ({ style: 'cop', skin: [0xf1c9a5, 0xc68b62, 0x9a6642][Math.floor(rand() * 3)], hair: 0x222222, shirt: 0x2c4a8a, pants: 0x16213a, shoes: 0x111111 });
  const swatOutfit = () => ({ style: 'swat', skin: 0xd9a27a, hair: 0x222222, shirt: 0x20262e, pants: 0x20262e, shoes: 0x111111 });

  const stars = () => G.wanted.stars;

  function spawnCop(x, z, swat = false) {
    const a = G.actors.spawn('cop', x, z, { outfit: swat ? swatOutfit() : copOutfit(), health: swat ? 130 : 70, armor: swat ? 60 : 0, weapon: swat || stars() >= 3 ? 'smg' : 'pistol', team: 'cop' });
    a.ai = { type: 'copfoot', cool: 0.5 + rand(), strafe: rand() < 0.5 ? 1 : -1, swat };
    return a;
  }

  Po.spawnCruiser = (type, x, z, heading) => {
    const v = G.vehicles.spawn(type, x, z, heading, { color: type === 'swat' ? 0x1c2026 : 0x1b2d52, kind: 'police', siren: true });
    v.driver = 'ai';
    v.sirenOn = true;
    v.ai = { type: 'police', stuck: 0, reverse: 0, route: [], routeT: 0, deployed: false, nav: null };
    v.occupant = spawnCop(x, z, type === 'swat');
    v.occupant.inVehicle = v;
    return v;
  };

  function cruiserAhead(type) {
    const P = G.player;
    for (let tries = 0; tries < 10; tries++) {
      const p = randomRoadPoint(rand, P.x, P.z, 120, 190);
      if (!p) continue;
      const cam = G.camera3.camera.position;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 100) continue;
      let clear = true;
      for (const v of G.vehicles.list) if (Math.hypot(v.x - p.x, v.z - p.z) < 10) clear = false;
      if (!clear) continue;
      const heading = Math.atan2(P.x - p.x, P.z - p.z);
      const v = Po.spawnCruiser(type, p.x, p.z, heading);
      return v;
    }
    return null;
  }

  Po.makeHostile = (a) => {
    a.kind = 'cop';
    a.team = 'cop';
    a.ai = { type: 'copfoot', cool: 0.4, strafe: 1, swat: false };
    a.outfit = copOutfit();
    G.actors.setWeapon(a, 'pistol');
    G.wanted.setStars(Math.max(2, stars()));
  };

  // ---------- helicopter
  function makeHeli() {
    const gb = new GeoBuilder();
    gb.box(0, 0, 0, 2.2, 2.0, 5.4, 0x1b2d52);
    gb.box(0, 0.1, 3.9, 0.5, 0.6, 3.2, 0x1b2d52);
    gb.box(0, 0.6, 5.4, 0.1, 1.4, 0.7, 0x1b2d52);
    gb.box(0, -1.15, 0, 2.6, 0.12, 4.2, 0x222222);
    gb.box(0, 0.7, 1.9, 1.8, 0.8, 0.3, 0x7ab6e8);
    const body = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 }));
    body.castShadow = true;
    const rg = new GeoBuilder();
    rg.box(0, 0, 0, 12, 0.06, 0.35, 0x333333);
    rg.box(0, 0, 0, 0.35, 0.06, 12, 0x333333);
    const rotor = new THREE.Mesh(rg.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    rotor.position.y = 1.35;
    const group = new THREE.Group();
    group.add(body, rotor);
    const spot = new THREE.SpotLight(0xfff2d0, 0, 140, 0.22, 0.4, 1.2);
    spot.position.set(0, -0.8, 1);
    group.add(spot);
    G.scene.add(spot.target);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(0, -1.2, 1);
    group.add(lamp);
    G.scene.add(group);
    return { group, rotor, spot, ang: rand() * 6, shootT: 1, x: G.player.x + 90, z: G.player.z, y: 45 };
  }

  function updateHeli(dt) {
    if (stars() >= 4) {
      if (!Po.heli) Po.heli = makeHeli();
      const h = Po.heli, P = G.player;
      h.ang += dt * 0.35;
      const tx = P.x + Math.cos(h.ang) * 24, tz = P.z + Math.sin(h.ang) * 24;
      h.x += (tx - h.x) * Math.min(1, dt * 0.9);
      h.z += (tz - h.z) * Math.min(1, dt * 0.9);
      h.y += (34 - h.y) * Math.min(1, dt);
      const yaw = Math.atan2(P.x - h.x, P.z - h.z);
      h.group.position.set(h.x, h.y, h.z);
      h.group.rotation.set(0.1, yaw, 0);
      h.rotor.rotation.y += dt * 30;
      h.spot.target.position.set(P.x, P.y, P.z);
      h.spot.intensity = 120 * (0.25 + G.env.night);
      // a lit cone on the ground
      if (stars() >= 5) {
        h.shootT -= dt;
        if (h.shootT <= 0) {
          h.shootT = 0.55;
          const d = Math.hypot(P.x - h.x, P.z - h.z);
          if (d < 70 && G.collision.lineOfSight(h.x, h.y, h.z, P.x, P.y + 1, P.z)) {
            const sx = h.x, sy = h.y, sz = h.z;
            const dx = P.x - sx, dy = P.y + 1 - sy, dz = P.z - sz;
            const l = Math.hypot(dx, dy, dz);
            G.fx.tracer(sx, sy, sz, P.x + (rand() - 0.5) * 3, P.y + 1, P.z + (rand() - 0.5) * 3);
            G.audio?.gunshot('smg', sx, sz);
            if (rand() < 0.45) {
              if (P.mode === 'car') G.vehicles.damage(P.vehicle, 4, 'police');
              P.takeDamage(P.mode === 'car' ? 1.5 : 4, 'police');
            }
            void l; void dy;
          }
        }
      }
    } else if (Po.heli) {
      G.scene.remove(Po.heli.group);
      G.scene.remove(Po.heli.spot.target);
      Po.heli = null;
    }
  }

  // ---------- cruiser driving
  function pursue(v, dt) {
    const ai = v.ai;
    const P = G.player;
    const tx0 = P.x, tz0 = P.z;
    const dx = tx0 - v.x, dz = tz0 - v.z;
    const dist = Math.hypot(dx, dz);
    const sinH = Math.sin(v.heading), cosH = Math.cos(v.heading);
    let tx = tx0, tz = tz0;
    // lead the target a little
    if (P.mode === 'car') { tx += P.vehicle.vx * 0.35; tz += P.vehicle.vz * 0.35; }
    const direct = dist < 70 && G.collision.lineOfSight(v.x, 1, v.z, tx0, 1, tz0);
    if (!direct) {
      ai.routeT -= dt;
      if (ai.routeT <= 0) {
        ai.routeT = 1.0;
        ai.route = route(nearestNode(v.x, v.z), nearestNode(tx0, tz0));
      }
      // first waypoint ahead of us
      let wp = null;
      for (const n of ai.route) {
        const wx = nodeX(n.i), wz = nodeZ(n.j);
        if (Math.hypot(wx - v.x, wz - v.z) > 16) { wp = [wx, wz]; break; }
      }
      if (wp) {
        // aim at the intersection but keep right-hand lane roughly
        tx = wp[0]; tz = wp[1];
      }
    }
    let want = Math.atan2(tx - v.x, tz - v.z);
    // whisker obstacle avoidance
    const L = 8 + v.speed * 0.55;
    const ray = (a) => G.collision.rayDistance(v.x, 0.8, v.z, Math.sin(a), 0, Math.cos(a), L);
    const rc = ray(want), rl = ray(want + 0.55), rr = ray(want - 0.55);
    if (rc < L) want += rl > rr ? 0.9 : -0.9;
    else if (rl < L * 0.5) want -= 0.5;
    else if (rr < L * 0.5) want += 0.5;
    const err = angleDiff(v.heading, want);
    let steer = clamp(err * 2.2, -1, 1);
    let desired = v.def.maxSpeed * 0.88;
    desired *= 1 - clamp((Math.abs(err) - 0.35) / 1.4, 0, 0.75);
    if (dist < 14) desired = Math.max(desired * 0.8, (P.mode === 'car' ? P.vehicle.speed : 4) + 6);
    // stuck detection and reverse manoeuvre
    if (v.speed < 1.2 && dist > 9) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 1.6) { ai.reverse = 1.3; ai.stuck = 0; ai.rdir = rand() < 0.5 ? 1 : -1; }
    let thr;
    if (ai.reverse > 0) {
      ai.reverse -= dt;
      thr = -1;
      steer = -steer * 0.8 + (ai.rdir || 1) * 0.4;
    } else {
      thr = clamp((desired - v.fwd) * 0.5, -1, 1);
    }
    v.input.steer = steer;
    v.input.throttle = thr;
    v.input.handbrake = false;

    // player on foot close by: park up and deploy the officers
    if (P.mode === 'foot' && dist < 28 && v.speed < 9 && !ai.deployed && v.occupant && !v.occupant.dead) {
      deploy(v);
    }
    // occupant shoots from the window at higher wanted levels
    if (stars() >= 3 && P.mode === 'car' && dist < 30 && v.occupant && !v.occupant.dead) {
      ai.shootT = (ai.shootT ?? 1) - dt;
      if (ai.shootT <= 0) {
        ai.shootT = 0.9 + rand() * 0.6;
        if (G.collision.lineOfSight(v.x, 1, v.z, P.x, 1, P.z)) {
          G.fx.tracer(v.x, 1.2, v.z, P.x + (rand() - 0.5) * 2, 1, P.z + (rand() - 0.5) * 2);
          G.audio?.gunshot('pistol', v.x, v.z);
          if (rand() < 0.4) { G.vehicles.damage(P.vehicle, 5, 'police'); P.takeDamage(1.5, 'police'); }
        }
      }
    }
    void sinH; void cosH;
  }

  function deploy(v) {
    v.ai.deployed = true;
    const cops = [v.occupant];
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    cops.forEach((a, k) => {
      a.inVehicle = null;
      a.x = v.x + lx * 2.2; a.z = v.z + lz * 2.2 + k;
      a.y = v.y;
    });
    v.occupant = null;
    v.driver = null;
    v.input.throttle = 0;
    v.input.handbrake = true;
    v.ai = { type: 'parked-police' };
  }

  // ---------- foot cops
  function copThink(a, dt) {
    const P = G.player;
    const ai = a.ai;
    const dx = P.x - a.x, dz = P.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (stars() === 0 && !ai.hostileOverride) {
      a.wantVX = a.wantVZ = 0;
      a.aiming = false;
      ai.idle = (ai.idle || 0) + dt;
      if (ai.idle > 25 && dist > 40) G.actors.remove(a);
      return;
    }
    ai.idle = 0;
    const los = dist < 60 && G.collision.lineOfSight(a.x, 1.4, a.z, P.x, 1.2, P.z);
    if (los) G.wanted.seen = true;
    const armed = a.weapon !== 'fists';
    const range = a.weapon === 'smg' ? 24 : 18;
    const shootOk = (stars() >= 2 || ai.swat) && armed;
    ai.cool -= dt;
    a.aiming = false;
    a.faceHeading = null;
    if (P.mode === 'car' && P.vehicle.speed > 14 && dist > 20) {
      // cops on foot can't keep up with a fast car; fire if close and then give up the chase target
      a.wantVX = a.wantVZ = 0;
    }
    const inRange = los && dist < range;
    const chaseSpeed = ai.swat ? 5.6 : 5.0 + stars() * 0.4;
    if (shootOk && inRange && dist > 5) {
      a.aiming = true;
      a.faceHeading = Math.atan2(dx, dz);
      // strafe while shooting
      const px = -dz / dist, pz = dx / dist;
      a.wantVX = px * ai.strafe * 2.2 + (dx / dist) * (dist > 11 ? 1.6 : -0.6);
      a.wantVZ = pz * ai.strafe * 2.2 + (dz / dist) * (dist > 11 ? 1.6 : -0.6);
      if (rand() < dt * 0.4) ai.strafe *= -1;
      if (ai.cool <= 0) {
        ai.cool = a.weapon === 'smg' ? 0.22 : 0.85 + rand() * 0.5;
        const acc = 0.35 + (P.mode === 'car' ? -0.12 : 0) - Math.min(0.2, dist * 0.005);
        const sy = a.y + 1.35;
        const ty = P.y + 1.0;
        const l = Math.hypot(dx, ty - sy, dz);
        const hit = rand() < acc;
        const ex = P.x + (hit ? 0 : (rand() - 0.5) * 5), ez = P.z + (hit ? 0 : (rand() - 0.5) * 5);
        G.fx.tracer(a.x + dx / dist * 0.8, sy, a.z + dz / dist * 0.8, ex, hit ? ty : 0.6, ez);
        G.fx.muzzle(a.x + dx / dist * 0.9, sy, a.z + dz / dist * 0.9, dx / dist, dz / dist);
        G.audio?.gunshot(a.weapon, a.x, a.z);
        a.fired = 0.15;
        void l;
        if (hit) {
          if (P.mode === 'car') { G.vehicles.damage(P.vehicle, 4, a); P.takeDamage(1.2, a); }
          else P.takeDamage(a.weapon === 'smg' ? 4.5 : 6.5, a, { dirX: dx / dist, dirZ: dz / dist });
        }
      }
    } else if (dist > 1.6) {
      let mx = dx / dist, mz = dz / dist;
      // avoid walls with a quick whisker
      const wall = G.collision.rayDistance(a.x, 0.9, a.z, mx, 0, mz, 3);
      if (wall < 3) {
        const side = G.collision.rayDistance(a.x, 0.9, a.z, -mz, 0, mx, 4) > G.collision.rayDistance(a.x, 0.9, a.z, mz, 0, -mx, 4) ? 1 : -1;
        const tmx = mx, tmz = mz;
        mx = -tmz * side * 0.9 + tmx * 0.2; mz = tmx * side * 0.9 + tmz * 0.2;
      }
      a.wantVX = mx * chaseSpeed;
      a.wantVZ = mz * chaseSpeed;
    } else {
      a.wantVX = a.wantVZ = 0;
      a.faceHeading = Math.atan2(dx, dz);
      if (ai.cool <= 0 && P.mode === 'foot') {
        ai.cool = 0.8;
        a.punchT = 0.28;
        a.punchSide = !a.punchSide;
        P.takeDamage(4, a, { dirX: dx / dist * 1.5, dirZ: dz / dist * 1.5 });
      }
    }
  }

  // ---------- roadblocks: two cruisers parked across the road ahead of a fleeing player
  Po.roadblock = () => {
    const P = G.player;
    if (P.mode !== 'car' || P.vehicle.speed < 8) return;
    const v = P.vehicle;
    const horiz = Math.abs(v.vx) > Math.abs(v.vz);
    const sign = horiz ? Math.sign(v.vx) : Math.sign(v.vz);
    const n = nearestNode(v.x + v.vx * 2.5, v.z + v.vz * 2.5);
    // choose an intersection about 150 m ahead along the current road
    let bx = horiz ? nodeX(n.i) + sign * 45 : nodeX(n.i);
    let bz = horiz ? nodeZ(n.j) : nodeZ(n.j) + sign * 45;
    bx = Math.max(-HALF + 20, Math.min(HALF - 20, bx));
    bz = Math.max(-HALF + 20, Math.min(HALF - 20, bz));
    const across = horiz ? 0 : Math.PI / 2;
    for (const off of [-4.6, 4.6]) {
      const x = horiz ? bx + 0 : bx + off, z = horiz ? bz + off : bz;
      const c = Po.spawnCruiser('cruiser', x, z, horiz ? 0 : Math.PI / 2);
      void across;
      deploy(c);
      c.input.handbrake = true;
    }
    G.hud.notify('Roadblock ahead!', 'warn');
  };
  G.events.on('wantedChanged', (now, before) => { if (now >= 3 && now > before) Po.roadblock(); });

  // ---------- main update
  Po.update = (dt) => {
    const P = G.player;
    const st = stars();
    spawnT -= dt;
    // count units
    let cruisers = 0, swats = 0, foots = 0;
    for (const v of G.vehicles.list) if ((v.ai?.type === 'police' || v.ai?.type === 'parked-police') && !v.dead) { if (v.type === 'swat') swats++; else cruisers++; }
    for (const a of G.actors.list) if (a.kind === 'cop' && !a.dead && !a.inVehicle) foots++;
    if (st > 0 && spawnT <= 0) {
      spawnT = 2.2;
      if (cruisers < CRUISERS[st]) cruiserAhead('cruiser');
      else if (swats < SWAT_VANS[st]) cruiserAhead('swat');
      else if (P.mode === 'foot' && foots < FOOT[st]) {
        const ang = rand() * 6.28, r = 55 + rand() * 25;
        const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
        if (onRoad(x, z, 3) && Math.abs(x) < HALF && Math.abs(z) < HALF) spawnCop(x, z, st >= 4 && rand() < 0.5);
      }
    }

    for (const v of G.vehicles.list) {
      if (v.ai?.type === 'police' && !v.dead) {
        if (st > 0 && v.driver === 'ai') {
          pursue(v, dt);
          if (Math.hypot(v.x - P.x, v.z - P.z) < 70 && G.collision.lineOfSight(v.x, 1.2, v.z, P.x, 1.2, P.z)) G.wanted.seen = true;
          if (Math.hypot(v.x - P.x, v.z - P.z) > 320) {
            if (v.occupant) G.actors.remove(v.occupant);
            G.vehicles.remove(v);
          }
        } else if (st === 0) {
          // stand down: join normal traffic
          v.sirenOn = false;
          if (v.occupant?.dead) v.occupant = null;
          if (v.driver === 'ai') G.traffic.resnap(v);
        }
      }
      if (v.ai?.type === 'parked-police') {
        v.input.handbrake = true;
        if (Math.hypot(v.x - P.x, v.z - P.z) > 200) G.vehicles.remove(v);
      }
      if (v.dead && v.occupant) { v.occupant.inVehicle = null; G.actors.damage(v.occupant, 999, v.lastAttacker); v.occupant = null; }
    }

    // officers killed inside a cruiser leave it dormant
    let nearestCop = 1e9;
    for (const a of G.actors.list) {
      if (a.kind !== 'cop' || a.dead || a.inVehicle) continue;
      copThink(a, dt);
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d < nearestCop) nearestCop = d;
      if (d > 300) G.actors.remove(a);
    }

    // busting: on foot, wanted, with a cop at arm's reach for a couple of seconds
    if (st > 0 && P.mode === 'foot' && !P.dead) {
      let adj = false;
      for (const a of G.actors.list) if (a.kind === 'cop' && !a.dead && !a.inVehicle && Math.hypot(a.x - P.x, a.z - P.z) < 1.9) adj = true;
      if (adj && P.actor.speed < 3.5) Po.bustT += dt; else Po.bustT = Math.max(0, Po.bustT - dt * 2);
      if (Po.bustT > 2.4) {
        Po.bustT = 0;
        G.events.emit('playerBusted');
      }
    } else Po.bustT = 0;

    // keep the nearest police vehicle distance for siren audio
    let sd = 1e9;
    for (const v of G.vehicles.list) if (v.siren && v.sirenOn !== false && !v.dead) sd = Math.min(sd, Math.hypot(v.x - P.x, v.z - P.z));
    Po.sirenDist = sd;
    Po.nearestCop = nearestCop;
    updateHeli(dt);
  };

  return Po;
}
