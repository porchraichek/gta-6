// Police response manager: what each wanted level sends, spawning with performance caps, sidewalk patrols,
// patrol cars joining a pursuit, deploying officers, PIT spin-outs, despawning and getting busted.
import { rand } from './random.js';
import { HALF } from './config.js';
import { randomRoadPoint, onRoad } from './roadnet.js';
import { createOfficerBrain } from './policeOfficers.js';
import { createPoliceDriver } from './policeDriving.js';
import { createPoliceHelicopter } from './policeHelicopter.js';
import { createRoadblocks } from './roadblocks.js';
import { createPoliceLights } from './policeLights.js';

// What each wanted level sends (index = stars).
export const ESCALATION = [
  null,
  { cruisers: 1, foot: 2, swat: 0, armored: 0, ram: false, shoot: false, driveBy: false, heli: false, heliGunner: false, roadblocks: false, spikes: false, heavy: false },
  { cruisers: 3, foot: 3, swat: 0, armored: 0, ram: true, shoot: true, driveBy: false, heli: false, heliGunner: false, roadblocks: false, spikes: false, heavy: false },
  { cruisers: 4, foot: 4, swat: 0, armored: 0, ram: true, shoot: true, driveBy: true, heli: true, heliGunner: true, roadblocks: true, spikes: false, heavy: false },
  { cruisers: 4, foot: 6, swat: 2, armored: 0, ram: true, shoot: true, driveBy: true, heli: true, heliGunner: true, roadblocks: true, spikes: true, heavy: false },
  { cruisers: 5, foot: 8, swat: 2, armored: 1, ram: true, shoot: true, driveBy: true, heli: true, heliGunner: true, roadblocks: true, spikes: true, heavy: true },
];
const MAX_VEHICLES = 8; // pursuit units; roadblocks may add two parked cars on top
const MAX_FOOT = 12;
const MAX_PATROL = 2; // calm-time foot patrols near the player
const BUST_TIME = 2.4;
const DESPAWN = { pursuit: 300, parked: 220, foot: 230, patrol: 190 };
const PIT_SPIN = 2.8, PIT_TIME = 0.5;

const isPoliceCar = (v) => v.ai?.type === 'police' && !v.dead;

export function createPolice(G) {
  const Po = { bustT: 0, bustTime: BUST_TIME, sirenDist: 1e9, nearestCop: 1e9, escalation: ESCALATION, units: {} };
  let spawnT = 0, patrolT = 3;

  const copOutfit = () => ({ style: 'cop', skin: [0xf1c9a5, 0xc68b62, 0x9a6642][Math.floor(rand() * 3)], hair: 0x222222, shirt: 0x2c4a8a, pants: 0x16213a, shoes: 0x111111 });
  const swatOutfit = () => ({ style: 'swat', skin: 0xd9a27a, hair: 0x222222, shirt: 0x20262e, pants: 0x20262e, shoes: 0x111111 });

  function copWeapon(o) {
    if (o.patrol) return 'pistol';
    if (o.heavy) return rand() < 0.5 ? 'shotgun' : 'smg';
    if (o.swat) return 'smg';
    return G.wanted.stars >= 3 && rand() < 0.5 ? 'smg' : 'pistol';
  }

  // opts: { swat, heavy, patrol }
  function spawnCop(x, z, opts = {}) {
    const armored = opts.swat || opts.heavy;
    const a = G.actors.spawn('cop', x, z, {
      outfit: armored ? swatOutfit() : copOutfit(), health: opts.heavy ? 160 : opts.swat ? 130 : 70,
      armor: opts.heavy ? 100 : opts.swat ? 60 : 0, weapon: copWeapon(opts), team: 'cop',
    });
    a.ai = { type: 'copfoot', cool: 0.5 + rand(), strafe: rand() < 0.5 ? 1 : -1, swat: !!armored, patrol: !!opts.patrol };
    return a;
  }
  Po.spawnCop = spawnCop;

  // A manned pursuit vehicle. type 'cruiser' | 'swat'; opts.armored makes a heavier, bigger response truck.
  Po.spawnCruiser = (type, x, z, heading, opts = {}) => {
    const color = opts.armored ? 0x2b2f36 : type === 'swat' ? 0x1c2026 : 0x1b2d52;
    const v = G.vehicles.spawn(type, x, z, heading, { color, kind: 'police', siren: true });
    v.driver = 'ai';
    v.sirenOn = true;
    v.ai = { type: 'police', stuck: 0, reverse: 0, route: [], routeT: 0 };
    if (opts.armored) {
      v.armored = true;
      v.health = v.maxHealth = v.maxHealth * 2;
      v.model.group.scale.setScalar(1.1);
    }
    v.occupant = spawnCop(x, z, { swat: type === 'swat', heavy: opts.armored });
    v.occupant.inVehicle = v;
    return v;
  };

  // Officers leave the vehicle and continue on foot; the vehicle stays parked with its lights on.
  function deploy(v) {
    const st = G.wanted.stars;
    const crew = [v.occupant];
    const extra = v.type === 'swat' ? (v.armored ? 3 : 2) : st >= 2 ? 1 : 0;
    for (let k = 0; k < extra && Po.units.foot + k < MAX_FOOT; k++) crew.push(spawnCop(v.x, v.z, { swat: v.type === 'swat', heavy: v.armored }));
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading), fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    crew.forEach((a, k) => {
      const side = k % 2 ? -1 : 1, back = Math.floor(k / 2) * 2.2;
      a.inVehicle = null;
      a.x = v.x + lx * side * 2.2 - fx * back;
      a.z = v.z + lz * side * 2.2 - fz * back;
      a.y = v.y;
    });
    v.occupant = null;
    v.driver = null;
    v.input.throttle = 0;
    v.input.handbrake = true;
    v.ai = { type: 'parked-police' };
  }

  Po.makeHostile = (a) => {
    a.kind = 'cop';
    a.team = 'cop';
    a.ai = { type: 'copfoot', cool: 0.4, strafe: 1, swat: false };
    a.outfit = copOutfit();
    G.actors.setWeapon(a, 'pistol');
    G.wanted.setStars(Math.max(2, G.wanted.stars));
  };

  function vehicleCount() {
    let n = 0;
    for (const v of G.vehicles.list) if (v.kind === 'police' && !v.dead && (v.ai?.type === 'police' || v.ai?.type === 'parked-police')) n++;
    return n;
  }

  const think = createOfficerBrain(G);
  const drive = createPoliceDriver(G, { deploy });
  const heli = createPoliceHelicopter(G);
  const lights = createPoliceLights(G);
  const roadblocks = createRoadblocks(G, {
    canSpawn: (n) => vehicleCount() + n <= MAX_VEHICLES + 2,
    spawnParked: (type, x, z, heading) => {
      const v = Po.spawnCruiser(type, x, z, heading);
      G.actors.remove(v.occupant);
      v.occupant = null;
      v.driver = null;
      v.input.handbrake = true;
      v.ai = { type: 'parked-police' };
      return v;
    },
    spawnGuard: (x, z, level) => {
      const a = spawnCop(x, z, { heavy: level.heavy });
      a.ai.hold = { x, z };
      return a;
    },
  });
  Po.heliSees = (x, z) => heli.sees(x, z);
  Object.defineProperty(Po, 'heli', { get: () => (heli.active ? heli : null) });
  Po.roadblocks = roadblocks.list;

  // PIT: a pitting cruiser touching the suspect's car sends it into a spin
  G.events.on('vehicleCollision', (a, b) => {
    const cop = a.ai?.pitting ? a : b.ai?.pitting ? b : null;
    if (!cop) return;
    const target = cop === a ? b : a;
    if (target.driver !== 'player' || target.pitSpin || (target.pitCool ?? 0) > G.time) return;
    target.pitSpin = { t: PIT_TIME, rate: cop.ai.pitSide * PIT_SPIN };
    target.pitCool = G.time + 3;
    G.fx.addShake(0.35);
  });

  function offscreen(x, z) {
    const cam = G.camera3.camera.position;
    const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz);
    if (d > 140) return true;
    const yaw = G.camera3.yaw;
    return (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / (d || 1) < 0.2;
  }

  function spawnPursuitVehicle(type, opts) {
    const P = G.player, cam = G.camera3.camera.position;
    for (let tries = 0; tries < 8; tries++) {
      const p = randomRoadPoint(rand, P.x, P.z, 120, 190);
      if (!p || Math.hypot(p.x - cam.x, p.z - cam.z) < 100) continue;
      let clear = true;
      for (const v of G.vehicles.list) if (Math.abs(v.x - p.x) < 10 && Math.abs(v.z - p.z) < 10) { clear = false; break; }
      if (!clear) continue;
      return Po.spawnCruiser(type, p.x, p.z, Math.atan2(P.x - p.x, P.z - p.z), opts);
    }
    return null;
  }

  function spawnFootOfficer(level) {
    const P = G.player;
    const ang = rand() * Math.PI * 2, r = 55 + rand() * 25;
    const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
    if (!onRoad(x, z, 3) || Math.abs(x) > HALF || Math.abs(z) > HALF || !offscreen(x, z)) return;
    spawnCop(x, z, { swat: G.wanted.stars >= 4 && rand() < 0.5, heavy: level.heavy && rand() < 0.4 });
  }

  // a calm-time officer walking the sidewalk somewhere near the player (they witness crimes)
  function spawnPatrol() {
    const P = G.player;
    for (let tries = 0; tries < 6; tries++) {
      const ang = rand() * Math.PI * 2, r = 70 + rand() * 60;
      const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
      if (Math.abs(x) > HALF || Math.abs(z) > HALF || onRoad(x, z) || !onRoad(x, z, 5) || !offscreen(x, z)) continue;
      if (G.collision.pushCircle(x, z, 0.6).hit) continue;
      spawnCop(x, z, { patrol: true });
      return;
    }
  }

  // patrol cars from ambient traffic answer the call when the player is nearby
  function recruitPatrolCar(v) {
    v.ai = { type: 'police', stuck: 0, reverse: 0, route: [], routeT: 0 };
    v.sirenOn = true;
    v.occupant = spawnCop(v.x, v.z);
    v.occupant.inVehicle = v;
  }

  function countUnits() {
    const u = Po.units;
    u.cruisers = u.swat = u.armored = u.foot = u.patrol = 0;
    for (const v of G.vehicles.list) {
      if (!isPoliceCar(v)) continue;
      if (v.armored) u.armored++;
      else if (v.type === 'swat') u.swat++;
      else u.cruisers++;
    }
    for (const a of G.actors.list) {
      if (a.kind !== 'cop' || a.dead || a.inVehicle) continue;
      if (a.ai?.patrol) u.patrol++;
      else u.foot++;
    }
    u.vehicles = u.cruisers + u.swat + u.armored;
    return u;
  }

  function spawnForLevel(level, u, dt) {
    const P = G.player;
    spawnT -= dt;
    if (spawnT > 0) return;
    spawnT = 2.4 - G.wanted.stars * 0.25;
    if (u.vehicles >= MAX_VEHICLES) { if (P.mode === 'foot' && u.foot < level.foot) spawnFootOfficer(level); return; }
    if (u.cruisers < level.cruisers) spawnPursuitVehicle('cruiser');
    else if (u.swat < level.swat) spawnPursuitVehicle('swat');
    else if (u.armored < level.armored) {
      if (spawnPursuitVehicle('swat', { armored: true })) G.wanted.radio.say('Armored unit on scene.', { from: 'unit' });
    } else if (P.mode === 'foot' && u.foot < level.foot) spawnFootOfficer(level);
  }

  function updateVehicles(dt, level, u) {
    const P = G.player;
    for (const v of G.vehicles.list) {
      if (v.dead && v.occupant) { v.occupant.inVehicle = null; G.actors.damage(v.occupant, 999, v.lastAttacker); v.occupant = null; }
      if (v.kind !== 'police' || v.dead) continue;
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      const type = v.ai?.type;
      if (type === 'traffic' && level && d < 160 && u.vehicles < MAX_VEHICLES && v.driver === 'ai') {
        recruitPatrolCar(v);
        u.vehicles++;
        if (G.wanted.search.active === false) G.wanted.radio.say(`Responding ${G.wanted.radio.where(v.x, v.z)}.`, { from: 'unit' });
      } else if (type === 'police') {
        if (d > DESPAWN.pursuit) {
          if (v.occupant) G.actors.remove(v.occupant);
          G.vehicles.remove(v);
        } else if (level && v.driver === 'ai') drive(v, dt, level);
        else if (!level) standDown(v);
      } else if (type === 'parked-police') {
        v.input.handbrake = true;
        if (!level) v.sirenOn = false;
        if (d > DESPAWN.parked || (!level && d > 90)) G.vehicles.remove(v);
      }
    }
    // a PIT in progress keeps spinning the player's car
    const pv = P.mode === 'car' ? P.vehicle : null;
    if (pv?.pitSpin) {
      pv.heading += pv.pitSpin.rate * dt;
      if ((pv.pitSpin.t -= dt) <= 0) pv.pitSpin = null;
    }
  }

  // wanted level gone: pursuit cars switch their lights off and rejoin traffic
  function standDown(v) {
    v.sirenOn = false;
    if (v.occupant?.dead) v.occupant = null;
    if (v.driver === 'ai' && v.occupant) G.traffic.resnap(v);
    else { v.ai = null; v.driver = null; }
  }

  function updateOfficers(dt, level) {
    const P = G.player;
    let nearest = 1e9;
    for (let i = G.actors.list.length - 1; i >= 0; i--) {
      const a = G.actors.list[i];
      if (a.kind !== 'cop' || a.dead || a.inVehicle) continue;
      think(a, dt, level);
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d < nearest) nearest = d;
      const limit = a.ai?.patrol ? DESPAWN.patrol : DESPAWN.foot;
      if (d > limit || (!level && !a.ai?.patrol && a.ai?.idle > 15 && d > 45)) G.actors.remove(a);
    }
    Po.nearestCop = nearest;
  }

  // on foot with an officer at arm's reach, or (1-2 stars) sitting in a stopped car with an officer at the door
  function updateBusting(dt) {
    const P = G.player, st = G.wanted.stars;
    let closing = false;
    if (st > 0 && !P.dead) {
      const reach = P.mode === 'foot' ? 1.9 : 3.6;
      const slow = P.mode === 'foot' ? P.actor.speed < 3.5 : st <= 2 && P.vehicle.speed < 1.2;
      if (slow) {
        for (const a of G.actors.list) {
          if (a.kind === 'cop' && !a.dead && !a.inVehicle && Math.abs(a.x - P.x) < reach && Math.hypot(a.x - P.x, a.z - P.z) < reach) { closing = true; break; }
        }
      }
    }
    if (closing) Po.bustT += dt; else Po.bustT = Math.max(0, Po.bustT - dt * 2);
    if (Po.bustT > BUST_TIME) {
      Po.bustT = 0;
      if (P.mode === 'car') P.exitVehicle(true);
      G.wanted.radio.say('Suspect in custody. Good work, everyone.', { from: 'unit', urgent: true });
      G.events.emit('playerBusted');
    }
  }

  Po.update = (dt) => {
    const P = G.player;
    const level = ESCALATION[G.wanted.stars];
    const u = countUnits();
    if (level) spawnForLevel(level, u, dt);
    else if (G.state === 'play' && (patrolT -= dt) <= 0) {
      patrolT = 5;
      if (u.patrol < MAX_PATROL) spawnPatrol();
    }
    updateVehicles(dt, level, u);
    updateOfficers(dt, level);
    updateBusting(dt);
    heli.update(dt, level);
    roadblocks.update(dt, level);
    lights.update();
    // nearest lit-up police vehicle drives the siren audio
    let sd = 1e9;
    for (const v of G.vehicles.list) if (v.siren && v.sirenOn !== false && !v.dead && v.kind === 'police') sd = Math.min(sd, Math.hypot(v.x - P.x, v.z - P.z));
    Po.sirenDist = sd;
  };

  return Po;
}
