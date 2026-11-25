// Vehicle-centred mission steps: tailing a car unseen, and stopping an armored cash truck on its route.
import { driveToward } from './vehicleAI.js';
import { nodeX, nodeZ } from './roadnet.js';
import { resolveAt, teleportPlayer, killAll } from './missionSteps.js';

function spawnDriven(G, type, x, z, heading, color, aiType) {
  const v = G.vehicles.spawn(type, x, z, heading, { color, mission: true });
  v.driver = 'ai';
  const driver = G.gangs.spawn(x, z, 1, { weapon: 'pistol', health: 60, aggro: 0 })[0];
  driver.inVehicle = v;
  v.occupant = driver;
  v.ai = { type: aiType, state: {} };
  return v;
}

function trackMarker(marker, x, z) {
  marker.group.position.x = x; marker.group.position.z = z;
  marker.x = x; marker.z = z;
}

// Follow a car to its destination. Too close fills a suspicion meter; too far for too long loses the target.
export const tail = ({ type = 'sedan', at, heading = 0, color = 0x2b2d42, dest, text, name = 'the target', minDist = 18, maxDist = 110, speedFactor = 0.5 }) => ({
  kind: 'tail',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    this.dest = resolveAt(G, dest, m);
    this.v = spawnDriven(G, type, p.x, p.z, heading, color, 'mission-tail');
    m.tailVehicle = this.v;
    this.suspicion = 0;
    this.lostT = 0;
    this.marker = G.markers.add({ x: p.x, z: p.z, color: 0x66e0ff, radius: 2.6, blip: true, icon: 'car', pillar: false });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: p.x, z: p.z };
    this.text = text;
  },
  update(m, dt) {
    const G = m.G, P = G.player, v = this.v;
    if (v.dead) return { fail: `You wrecked ${name}. The trail is cold.` };
    const d = Math.hypot(P.x - v.x, P.z - v.z);
    const toDest = driveToward(G, v, v.ai.state, this.dest.x, this.dest.z, { speed: v.def.maxSpeed * speedFactor, slowNear: 25 });
    trackMarker(this.marker, v.x, v.z);
    m.objective.x = v.x; m.objective.z = v.z;
    // suspicion: tailgating is obvious, hanging back at mid range is safe
    if (d < minDist) this.suspicion += dt * 0.45;
    else if (d < minDist * 1.8) this.suspicion += dt * 0.12;
    else this.suspicion = Math.max(0, this.suspicion - dt * 0.08);
    if (P.mode === 'foot' && d < 12) this.suspicion += dt * 0.5;
    m.progress = Math.min(1, this.suspicion);
    const warn = this.suspicion > 0.6 ? ' — BACK OFF!' : d > maxDist * 0.75 ? ' — losing them!' : '';
    m.objective.text = `${this.text}${warn}`;
    if (this.suspicion >= 1) return { fail: `${name[0].toUpperCase() + name.slice(1)} spotted the tail.` };
    if (d > maxDist) { this.lostT += dt; if (this.lostT > 7) return { fail: `You lost ${name}.` }; } else this.lostT = 0;
    if (toDest < 14) {
      v.input.throttle = 0; v.input.handbrake = true;
      m.progress = null;
      return 'done';
    }
  },
  end(m) { m.progress = null; this.v.input.throttle = 0; this.v.input.handbrake = true; },
  debugSolve(m) {
    const v = this.v;
    v.x = this.dest.x; v.z = this.dest.z; v.vx = v.vz = 0;
    teleportPlayer(m.G, this.dest.x + 40, this.dest.z);
    this.suspicion = 0;
  },
});

// An armored truck drives a route of road nodes [i,j]. Damage it enough to disable it, then deal with the guards.
export const armoredTruck = ({ route, text, guards = 3, guardWeapon = 'smg', health = 900, disableAt = 0.5 }) => ({
  kind: 'armoredTruck',
  begin(m) {
    const G = m.G;
    this.pts = route.map(([i, j]) => [nodeX(i), nodeZ(j)]);
    const [x, z] = this.pts[0];
    const [nx, nz] = this.pts[1];
    const v = spawnDriven(G, 'van', x, z, Math.atan2(nx - x, nz - z), 0x2f4f3a, 'mission-truck');
    v.health = v.maxHealth = health;
    v.missionName = 'Ironside armored truck';
    m.truck = v;
    this.v = v;
    this.wp = 1;
    this.phase = 'drive';
    this.marker = G.markers.add({ x, z, color: 0xff4d5e, radius: 3.2, blip: true, icon: 'enemy', pillar: true, height: 25 });
    m.cleanup.push(() => G.markers.remove(this.marker));
    const end = this.pts[this.pts.length - 1];
    this.endMarker = G.markers.add({ x: end[0], z: end[1], color: 0xff8a3d, radius: 6, blip: true, icon: 'obj', pillar: false });
    m.cleanup.push(() => G.markers.remove(this.endMarker));
    m.objective = { text, x, z };
    this.text = text;
  },
  update(m, dt) {
    const G = m.G, v = this.v;
    if (v.dead) return { fail: 'The truck blew up, and the cash with it.' };
    trackMarker(this.marker, v.x, v.z);
    if (this.phase === 'drive') {
      const [tx, tz] = this.pts[this.wp];
      const d = driveToward(G, v, v.ai.state, tx, tz, { speed: v.def.maxSpeed * 0.72 });
      if (d < 14) {
        this.wp++;
        if (this.wp >= this.pts.length) return { fail: 'The truck reached the vault.' };
      }
      m.objective.x = v.x; m.objective.z = v.z;
      m.progress = Math.max(0, (v.health / v.maxHealth - disableAt) / (1 - disableAt));
      if (v.health <= v.maxHealth * disableAt) this.disable(m);
      return;
    }
    // disabled: keep the shell intact while the crew fights over it
    v.burning = false;
    v.health = Math.max(v.health, v.maxHealth * 0.3);
    v.input.throttle = 0; v.input.handbrake = true;
    const left = G.gangs.aliveCount(this.guards);
    m.objective.text = `Kill the truck guards (${left} left)`;
    const alive = this.guards.find((a) => !a.dead && !a.removed);
    if (alive) { m.objective.x = alive.x; m.objective.z = alive.z; }
    if (left === 0) { m.progress = null; return 'done'; }
  },
  disable(m) {
    const G = m.G, v = this.v;
    this.phase = 'guards';
    v.ai = { type: 'mission-truck-stopped', state: {} };
    v.burning = false;
    m.progress = null;
    G.hud.notify('The truck is disabled! Guards are bailing out.', 'warn');
    G.fx.addShake?.(0.2);
    this.guards = G.gangs.spawn(v.x, v.z, guards, { weapon: guardWeapon, spread: 5, aggro: 80, health: 80, armor: 30 });
    for (const a of this.guards) a.ai.awake = true;
    m.enemies.push(...this.guards);
    if (v.occupant) { const o = v.occupant; o.inVehicle = null; o.x = v.x + 2.5; o.z = v.z; o.ai.awake = true; this.guards.push(o); m.enemies.push(o); v.occupant = null; }
    v.driver = null;
  },
  end(m) { m.progress = null; },
  debugSolve(m) {
    if (this.phase === 'drive') { this.v.health = this.v.maxHealth * disableAt - 1; this.disable(m); }
    killAll(m.G, this.guards);
  },
});

// The player has parked a rigged vehicle: get clear before it blows. Explodes m.vehicle when the fuse runs out.
export const fleeBlast = ({ seconds = 8, radius = 25, text = 'Bail out and run!' }) => ({
  kind: 'fleeBlast',
  begin(m) {
    this.t = seconds;
    m.objective = { text, x: m.vehicle.x, z: m.vehicle.z };
    m.timer = { t: seconds, label: 'FUSE' };
  },
  update(m, dt) {
    const G = m.G, P = G.player, v = m.vehicle;
    this.t -= dt;
    m.timer.t = Math.max(0, this.t);
    const d = Math.hypot(P.x - v.x, P.z - v.z);
    m.objective.text = d < radius ? `${text} (${Math.ceil(radius - d)} m to safety)` : 'Safe distance. Keep your head down.';
    if (this.t > 0) return;
    m.timer = null;
    if (!v.dead) G.vehicles.explode(v);
    return 'done';
  },
  debugSolve(m) {
    const P = m.G.player;
    if (P.mode === 'car') P.exitVehicle(true);
    P.teleport(m.vehicle.x + radius + 10, m.vehicle.z);
    this.t = 0;
  },
});
