// Combat mission steps: attack waves (optionally defending a spot) and a stealth takedown with patrolling guards.
import { resolveAt, teleportPlayer, killAll } from './missionSteps.js';
import { rand, angleDiff } from './random.js';

// waves: [{ count, weapon, health, armor }]. With `protect`, enemies standing inside `radius` wear down the spot's integrity.
export const waves = ({ at, waves: list, text, protect = false, radius = 10, spawnDist = 48, leash = 55, integrity = 100, pause = 4 }) => ({
  kind: 'waves',
  begin(m) {
    const G = m.G;
    this.p = resolveAt(G, at, m);
    this.L = typeof list === 'function' ? list(G.missions.state.flags) : list;
    this.wave = -1;
    this.gap = 1.5;
    this.list = [];
    this.hp = integrity;
    this.awayT = 0;
    this.marker = G.markers.add({ x: this.p.x, z: this.p.z, color: protect ? 0x7cf29a : 0xff4d5e, radius, blip: true, icon: protect ? 'obj' : 'enemy', pillar: protect, height: 20 });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: this.p.x, z: this.p.z };
    this.text = text;
  },
  spawnWave(m) {
    const G = m.G, w = this.L[this.wave];
    const groups = Math.min(3, Math.ceil(w.count / 3));
    const base = rand() * Math.PI * 2;
    this.list = [];
    for (let g = 0; g < groups; g++) {
      const a = base + (g / groups) * Math.PI * 2;
      let x = this.p.x + Math.cos(a) * spawnDist, z = this.p.z + Math.sin(a) * spawnDist;
      const fix = G.collision.pushCircle(x, z, 1.2);
      if (fix.hit) { x = fix.x; z = fix.z; }
      const n = Math.ceil(w.count / groups) - (g === groups - 1 ? groups * Math.ceil(w.count / groups) - w.count : 0);
      const thugs = G.gangs.spawn(x, z, n, { weapon: w.weapon ?? 'pistol', health: w.health ?? 65, armor: w.armor ?? 0, spread: 4, aggro: 200 });
      for (const t of thugs) t.ai.awake = true;
      this.list.push(...thugs);
    }
    m.enemies.push(...this.list);
    G.hud.centerText(`WAVE ${this.wave + 1}/${this.L.length}`);
    G.audio?.wantedUp?.();
  },
  update(m, dt) {
    const G = m.G, P = G.player;
    const left = G.gangs.aliveCount(this.list);
    if (left === 0) {
      if (this.wave >= this.L.length - 1) { m.progress = null; return 'done'; }
      this.gap -= dt;
      m.objective.text = `${this.text}: next wave incoming…`;
      if (this.gap <= 0) { this.wave++; this.gap = pause; this.spawnWave(m); }
    } else {
      m.objective.text = `${this.text} (wave ${this.wave + 1}/${this.L.length}, ${left} left)`;
    }
    if (protect) {
      for (const a of this.list) if (!a.dead && !a.removed && Math.hypot(a.x - this.p.x, a.z - this.p.z) < radius) this.hp -= dt * 3.5;
      m.progress = Math.max(0, this.hp / integrity);
      if (this.hp <= 0) return { fail: 'They overran the place.' };
    }
    const away = Math.hypot(P.x - this.p.x, P.z - this.p.z) > leash;
    this.awayT = away ? this.awayT + dt : 0;
    if (away) m.objective.text = 'Get back to the fight!';
    if (this.awayT > 10) return { fail: 'You abandoned the fight.' };
  },
  end(m) { m.progress = null; },
  debugSolve(m) {
    teleportPlayer(m.G, this.p.x, this.p.z);
    if (this.wave < 0) { this.wave = 0; this.spawnWave(m); }
    while (true) {
      killAll(m.G, this.list);
      if (this.wave >= this.L.length - 1) break;
      this.wave++;
      this.spawnWave(m);
    }
  },
});

// Stealth: guards walk patrol loops and watch a vision cone. Sneak behind them and press E for a silent takedown.
// Being seen (or firing a gun nearby) raises the alarm: everyone turns hostile and the target has to die before the clock runs out.
export const stealth = ({ at, guards, target, text, alarmTime = 60, viewDist = 17, viewCone = 0.95 }) => ({
  kind: 'stealth',
  begin(m) {
    const G = m.G;
    this.p = resolveAt(G, at, m);
    this.alarm = false;
    this.guards = [];
    const spawnOne = (dx, dz, opts) => {
      const a = G.gangs.spawn(this.p.x + dx, this.p.z + dz, 1, { spread: 0, aggro: 0, ...opts })[0];
      a.kind = 'guard'; // gang AI ignores guards until the alarm goes off
      a.seen = 0;
      return a;
    };
    for (const g of guards) {
      const a = spawnOne(g.at[0], g.at[1], { weapon: g.weapon ?? 'pistol', health: 70 });
      a.patrol = (g.patrol || [g.at]).map(([x, z]) => [this.p.x + x, this.p.z + z]);
      a.patrolI = 0;
      this.guards.push(a);
    }
    this.target = spawnOne(target.at[0], target.at[1], { weapon: 'pistol', health: target.health ?? 90 });
    this.target.patrol = [[this.target.x, this.target.z]];
    this.target.patrolI = 0;
    this.all = [...this.guards, this.target];
    m.enemies.push(...this.all);
    this.shots = G.player.stats.shots;
    this.marker = G.markers.add({ x: this.target.x, z: this.target.z, color: 0xff4d5e, radius: 1.6, blip: true, icon: 'enemy', pillar: false });
    m.cleanup.push(() => G.markers.remove(this.marker));
    m.objective = { text, x: this.target.x, z: this.target.z };
    this.text = text;
    this.targetName = target.name;
  },
  raiseAlarm(m, why) {
    if (this.alarm) return;
    const G = m.G;
    this.alarm = true;
    m.timer = { t: alarmTime, label: 'ESCAPE' };
    m.progress = null;
    G.hud.notify(why, 'warn');
    G.hud.centerText('ALARM!');
    G.audio?.wantedUp?.();
    for (const a of this.all) if (!a.dead && !a.removed) { a.kind = 'thug'; a.ai.awake = true; a.ai.aggro = 200; }
  },
  update(m, dt) {
    const G = m.G, P = G.player;
    const t = this.target;
    if (t.dead) { m.timer = null; m.progress = null; return 'done'; }
    this.marker.group.position.set(t.x, this.marker.group.position.y, t.z);
    this.marker.x = t.x; this.marker.z = t.z;
    m.objective.x = t.x; m.objective.z = t.z;
    if (this.alarm) {
      m.objective.text = `Alarm raised! Take out ${this.targetName} before he slips away`;
      m.timer.t -= dt;
      if (m.timer.t <= 0) return { fail: `${this.targetName} escaped.` };
      return;
    }
    if (G.player.stats.shots > this.shots && Math.hypot(P.x - t.x, P.z - t.z) < 60) return this.raiseAlarm(m, 'Gunfire! The guards are on alert.');
    let worst = 0, takedown = null;
    for (const a of this.all) {
      if (a.dead || a.removed) continue;
      if (a.health < a.maxHealth) return this.raiseAlarm(m, 'A guard got hurt and called it in.');
      this.patrol(a, dt);
      const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
      const facing = Math.abs(angleDiff(a.heading, Math.atan2(dx, dz)));
      const inCone = d < viewDist && facing < viewCone && G.collision.lineOfSight(a.x, 1.5, a.z, P.x, 1.2, P.z);
      const close = d < 2.4 && facing < 1.6;
      if (inCone || close) a.seen += dt * (P.mode === 'car' ? 2.2 : 1) * (P.sprinting ? 1.6 : 1) * (1.5 - d / viewDist);
      else a.seen = Math.max(0, a.seen - dt * 0.3);
      worst = Math.max(worst, a.seen);
      if (a.seen >= 1) return this.raiseAlarm(m, 'You were spotted!');
      // a fallen comrade in plain view gives the game away
      for (const b of this.all) if (b.dead && !b.noticed && Math.hypot(b.x - a.x, b.z - a.z) < 9 && Math.abs(angleDiff(a.heading, Math.atan2(b.x - a.x, b.z - a.z))) < viewCone) {
        b.noticed = true;
        return this.raiseAlarm(m, 'A guard found a body!');
      }
      if (P.mode === 'foot' && d < 1.9 && facing > 1.3) takedown = a;
    }
    m.progress = worst > 0.02 ? Math.min(1, worst) : null;
    m.objective.text = worst > 0.5 ? `${this.text}: they're getting suspicious!` : this.text;
    if (takedown) {
      G.hud.prompt('E', 'Silent takedown');
      if (G.input.hit('KeyE')) this.takedown(m, takedown);
    }
  },
  takedown(m, a) {
    const G = m.G;
    G.player.actor.punchT = 0.28;
    G.actors.damage(a, 1e6, null, { dirX: Math.sin(G.player.heading), dirZ: Math.cos(G.player.heading), knock: 1 });
    G.audio?.thud?.(a.x, a.z, 0.4);
    if (a === this.target) G.hud.notify(`${this.targetName} is down. Quietly.`, 'good');
  },
  patrol(a, dt) {
    const pts = a.patrol;
    const [tx, tz] = pts[a.patrolI % pts.length];
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (pts.length < 2 || d < 0.8) {
      a.wantVX = a.wantVZ = 0;
      a.waitT = (a.waitT ?? 2) - dt;
      if (a.waitT <= 0) { a.waitT = 2 + rand() * 2; a.patrolI++; if (pts.length < 2) a.heading += (rand() - 0.5) * 2.4; }
      return;
    }
    a.wantVX = (dx / d) * 1.4; a.wantVZ = (dz / d) * 1.4;
  },
  end(m) {
    m.timer = null; m.progress = null;
    m.stealthClean = !this.alarm;
    for (const a of this.all) if (!a.dead && !a.removed) { a.kind = 'thug'; a.ai.aggro = 20; }
  },
  debugSolve(m) {
    teleportPlayer(m.G, this.target.x - 2, this.target.z - 2);
    this.takedown(m, this.target);
  },
});
