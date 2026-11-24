// Reusable mission step builders: dialogue, go-to, steal vehicle, kill, chase, hold, escape and instant effects.
import { driveToward } from './vehicleAI.js';
import { rand } from './random.js';
import { N } from './config.js';
import { nodeX, nodeZ, nearestNode } from './roadnet.js';

export function resolveAt(G, at, m) {
  if (typeof at === 'function') return resolveAt(G, at(m), m);
  if (Array.isArray(at)) return { x: at[0], z: at[1] };
  if (at?.lm) {
    const l = G.city.landmarks[at.lm];
    return { x: l.x + (at.dx || 0), z: l.z + (at.dz || 0), roadX: l.roadX, roadZ: l.roadZ };
  }
  return at;
}

// Lines can be an array or a function (flags, m) => array, so dialogue can react to earlier story choices.
export const resolveLines = (lines, m) => (typeof lines === 'function' ? lines(m.G.missions.state.flags, m) : lines) || [];

// Hand a mission vehicle back to the world so traffic can despawn it later.
export function releaseVehicle(G, v) {
  if (!v || v.removed) return;
  v.mission = false;
  if (v.driver === 'ai') {
    v.ai = null;
    v.driver = null;
    v.parked = true;
    v.input.throttle = 0;
    v.input.handbrake = true;
    if (v.occupant && !v.occupant.removed) G.actors.remove(v.occupant);
    v.occupant = null;
  }
}

export const say = (lines) => ({
  kind: 'say',
  begin(m) { m.G.dialogue.play(resolveLines(lines, m)); },
  update(m) { return m.G.dialogue.busy ? undefined : 'done'; },
  debugSolve(m) { m.G.dialogue.skip(); },
});

// A two-option story choice. Stores the picked option id in missions.state.flags[flag], then plays that option's lines.
export const choice = ({ flag, prompt, options }) => ({
  kind: 'choice',
  begin(m) {
    this.picked = null;
    m.objective = { text: prompt, x: null, z: null };
    m.G.dialogue.choose(prompt, options.map((o) => o.label), (i) => {
      const o = options[i];
      m.G.missions.state.flags[flag] = o.id;
      o.effect?.(m);
      m.G.dialogue.play(resolveLines(o.lines || [], m));
      this.picked = o;
    });
  },
  update(m) { if (this.picked && !m.G.dialogue.busy) return 'done'; },
  end(m) { if (m.G.dialogue.choice) m.G.dialogue.clear(); },
  debugSolve(m) { if (!this.picked) m.G.dialogue.pick(0); m.G.dialogue.skip(); },
});

export const goTo = ({ at, text, radius = 4.5, needVehicle = false, missionVehicle = false, time = null, color = 0xffd166, onArrive, damageLimit = 0, damageFail = 'The vehicle was wrecked.' }) => ({
  kind: 'goTo',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    this.p = p;
    m.objective = { text, x: p.x, z: p.z };
    this.marker = G.markers.add({ x: p.x, z: p.z, color, radius, blip: true, icon: 'obj', pillar: true });
    m.cleanup.push(() => G.markers.remove(this.marker));
    if (time) m.timer = { t: time, label: 'TIME' };
  },
  update(m, dt) {
    const G = m.G, P = G.player;
    if (m.timer) {
      m.timer.t -= dt;
      if (m.timer.t <= 0) return { fail: 'Out of time.' };
    }
    if (missionVehicle && m.vehicle) {
      if (m.vehicle.dead) return { fail: 'The vehicle was destroyed.' };
      if (damageLimit && m.vehicle.health < m.vehicle.maxHealth * damageLimit) {
        G.vehicles.explode(m.vehicle);
        return { fail: damageFail };
      }
      if (P.vehicle !== m.vehicle) {
        m.objective.text = `Get back in the ${m.vehicle.def.name}`;
        m.objective.x = m.vehicle.x; m.objective.z = m.vehicle.z;
        return;
      }
      m.objective.text = text;
      m.objective.x = this.p.x; m.objective.z = this.p.z;
    }
    const d = Math.hypot(P.x - this.p.x, P.z - this.p.z);
    if (d < radius + (P.mode === 'car' ? 2 : 0) && (!needVehicle || P.mode === 'car') && (!missionVehicle || P.vehicle === m.vehicle)) {
      if (m.timer && m.timer.keep !== true) m.timer = null;
      onArrive?.(m);
      return 'done';
    }
  },
  debugSolve(m) {
    const G = m.G, P = G.player;
    if (missionVehicle && m.vehicle && P.vehicle !== m.vehicle) P.enterVehicle(m.vehicle);
    if (needVehicle && P.mode !== 'car') {
      const v = G.vehicles.spawn('compact', P.x, P.z, 0);
      P.enterVehicle(v);
    }
    teleportPlayer(G, this.p.x, this.p.z);
  },
});

// Move the player (and their car) to a point; used by debug helpers and tests.
export function teleportPlayer(G, x, z) {
  const P = G.player;
  if (P.mode === 'car') {
    const v = P.vehicle;
    v.x = x; v.z = z; v.vx = v.vz = 0; v.fwd = 0;
  } else P.teleport(x, z);
}

export const getVehicle = ({ type, at, heading = 0, color, text, name, health }) => ({
  kind: 'getVehicle',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    const v = G.vehicles.spawn(type, p.x, p.z, heading, { color, mission: true });
    v.missionName = name;
    if (health) v.health = v.maxHealth = health;
    m.vehicle = v;
    m.cleanupVeh = v;
    this.marker = G.markers.add({ x: p.x, z: p.z, color: 0x66e0ff, radius: 3, blip: true, icon: 'car', pillar: true, height: 30 });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: p.x, z: p.z };
  },
  update(m) {
    const G = m.G;
    const v = m.vehicle;
    if (v.dead) return { fail: 'The vehicle was destroyed.' };
    this.marker.group.position.set(v.x, 0.2, v.z);
    m.objective.x = v.x; m.objective.z = v.z;
    if (G.player.vehicle === v) {
      G.markers.remove(this.marker);
      return 'done';
    }
  },
  debugSolve(m) { const P = m.G.player; if (P.mode === 'car') P.exitVehicle(true); P.enterVehicle(m.vehicle); },
});

// Kill a list of actors instantly (debug helpers and tests).
export function killAll(G, list) {
  for (const a of list || []) if (!a.dead && !a.removed) G.actors.damage(a, 1e6, null);
}

// Kill every thug in a group placed at `at`.
export const kill = ({ at, count, weapon = 'fists', text, spread = 9, aggro = 26, health = 70, armor = 0, damage, boss }) => ({
  kind: 'kill',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    this.p = p;
    m.enemies = G.gangs.spawn(p.x, p.z, count, { weapon, spread, aggro, health, armor, damage, boss });
    this.marker = G.markers.add({ x: p.x, z: p.z, color: 0xff4d5e, radius: Math.max(6, spread), blip: true, icon: 'enemy', pillar: false });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: p.x, z: p.z };
    this.text = text;
  },
  update(m) {
    const G = m.G;
    const left = G.gangs.aliveCount(m.enemies);
    m.objective.text = `${this.text} (${left} left)`;
    const alive = m.enemies.find((a) => !a.dead && !a.removed);
    if (alive) { m.objective.x = alive.x; m.objective.z = alive.z; this.marker.group.position.set(alive.x, 0.2, alive.z); this.marker.x = alive.x; this.marker.z = alive.z; }
    if (left === 0) return 'done';
  },
  debugSolve(m) { killAll(m.G, m.enemies); },
});

export const holdAt = ({ at, seconds, text, radius = 6 }) => ({
  kind: 'holdAt',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    this.p = p; this.t = 0;
    this.marker = G.markers.add({ x: p.x, z: p.z, color: 0x7cf29a, radius, blip: true, icon: 'obj' });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: p.x, z: p.z };
  },
  update(m, dt) {
    const P = m.G.player;
    if (Math.hypot(P.x - this.p.x, P.z - this.p.z) < radius) this.t += dt;
    m.progress = Math.min(1, this.t / seconds);
    if (this.t >= seconds) { m.progress = null; return 'done'; }
  },
  debugSolve(m) { teleportPlayer(m.G, this.p.x, this.p.z); this.t = seconds; },
});

export const escapeWanted = ({ stars, text }) => ({
  kind: 'escapeWanted',
  begin(m) {
    if (stars) m.G.wanted.setStars(stars);
    m.objective = { text, x: null, z: null };
    m.evading = true;
  },
  update(m) {
    if (m.G.wanted.stars === 0) { m.evading = false; return 'done'; }
  },
  debugSolve(m) { m.G.wanted.clear(); },
});

export const instant = (fn) => ({
  kind: 'instant',
  begin(m) { fn(m); },
  update() { return 'done'; },
});

export const wait = (seconds) => ({
  kind: 'wait',
  begin() { this.t = seconds; },
  debugSolve() { this.t = 0; },
  update(m, dt) { this.t -= dt; if (this.t <= 0) return 'done'; },
});

// A fleeing target vehicle the player must wreck before it escapes.
export const chase = ({ type, at, heading = 0, text, color = 0x8338ec, speedFactor = 0.82, escapeDist = 230, boss = false, health }) => ({
  kind: 'chase',
  begin(m) {
    const G = m.G;
    const p = resolveAt(G, at, m);
    const v = G.vehicles.spawn(type, p.x, p.z, heading, { color, mission: true });
    if (health) v.health = v.maxHealth = health;
    v.driver = 'ai';
    const driver = G.gangs.spawn(p.x, p.z, 1, { weapon: 'pistol', health: boss ? 120 : 60, aggro: 0 })[0];
    driver.inVehicle = v;
    driver.ai.awake = false;
    v.occupant = driver;
    v.ai = { type: 'mission-flee', state: {}, wp: null };
    m.chaseVehicle = v;
    this.marker = G.markers.add({ x: p.x, z: p.z, color: 0xff4d5e, radius: 3, blip: true, icon: 'enemy', pillar: true, height: 25 });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: p.x, z: p.z };
    this.v = v;
    this.timer = 3;
  },
  update(m, dt) {
    const G = m.G, v = this.v;
    this.timer -= dt;
    if (v.dead) return 'done';
    this.marker.group.position.set(v.x, 0.2, v.z);
    this.marker.x = v.x; this.marker.z = v.z;
    m.objective.x = v.x; m.objective.z = v.z;
    const P = G.player;
    const d = Math.hypot(P.x - v.x, P.z - v.z);
    // the target starts moving once the player is close or after a few seconds
    if (this.timer > 0 && d > 28) { v.input.handbrake = true; v.input.throttle = 0; return; }
    if (!v.ai.wp || Math.hypot(v.ai.wp[0] - v.x, v.ai.wp[1] - v.z) < 24) {
      const n = nearestNode(v.x, v.z);
      // pick a node 3-6 intersections away, away from the player
      let best = null, bd = -1;
      for (let k = 0; k < 6; k++) {
        const i = Math.max(0, Math.min(N, n.i + Math.floor((rand() - 0.5) * 8)));
        const j = Math.max(0, Math.min(N, n.j + Math.floor((rand() - 0.5) * 8)));
        const score = Math.hypot(nodeX(i) - P.x, nodeZ(j) - P.z) + rand() * 60;
        if (score > bd) { bd = score; best = [nodeX(i), nodeZ(j)]; }
      }
      v.ai.wp = best;
    }
    v.input.handbrake = false;
    driveToward(G, v, v.ai.state, v.ai.wp[0], v.ai.wp[1], { speed: v.def.maxSpeed * speedFactor });
    if (v.burning) v.input.throttle *= 0.5;
    if (d > escapeDist) return { fail: 'The target got away.' };
  },
  end(m) { /* wreck is cleaned up by the mission */ },
  debugSolve(m) { if (!this.v.dead) m.G.vehicles.explode(this.v); },
});
