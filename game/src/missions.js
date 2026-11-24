// Mission runner: shows start markers, plays intros, runs step lists, handles rewards, failure, retry and progression.
import { MISSIONS } from './storyMissions.js';
import { say } from './missionSteps.js';

export function createMissions(G) {
  const M = {
    state: { next: 0, completed: [], rep: 0 },
    active: null,
    startMarker: null,
    list: MISSIONS,
    banner: null,
    finished: false,
  };

  M.refreshMarkers = () => {
    if (M.startMarker) { G.markers.remove(M.startMarker); M.startMarker = null; }
    if (M.active) return;
    const def = MISSIONS[M.state.next];
    if (!def) return;
    const lm = G.city.landmarks[def.giver];
    M.startMarker = G.markers.add({ x: lm.x, z: lm.z, color: 0xffd166, radius: 3.4, blip: true, icon: 'mission', label: def.title, pillar: true, height: 45 });
  };

  M.start = (def) => {
    if (M.active) return;
    const m = { G, def, stepIndex: -1, steps: [say(def.intro), ...def.steps], objective: null, timer: null, cleanup: [], vehicle: null, enemies: [], progress: null, t: 0 };
    M.active = m;
    if (M.startMarker) { G.markers.remove(M.startMarker); M.startMarker = null; }
    G.hud.banner(def.title.toUpperCase(), def.summary, 'mission');
    G.audio?.uiSelect();
    advance(m);
    G.events.emit('missionStarted', def);
  };

  function advance(m) {
    const prev = m.steps[m.stepIndex];
    prev?.end?.(m);
    for (const f of m.cleanup.splice(0)) f();
    m.stepIndex++;
    m.timer = m.timer && m.timer.keep ? m.timer : null;
    if (m.stepIndex >= m.steps.length) return complete(m);
    m.steps[m.stepIndex].begin(m);
  }

  function endMission(m) {
    for (const f of m.cleanup.splice(0)) f();
    for (const a of m.enemies || []) if (!a.dead && !a.removed && a.kind === 'thug') { a.ai.awake = true; }
    G.dialogue.clear();
    // leave a mission vehicle for the player if they're in it; otherwise remove it
    if (m.vehicle && !m.vehicle.removed && G.player.vehicle !== m.vehicle) {
      m.vehicle.mission = false;
    } else if (m.vehicle) m.vehicle.mission = false;
    if (m.chaseVehicle) m.chaseVehicle.mission = false;
    M.active = null;
  }

  function complete(m) {
    const def = m.def;
    endMission(m);
    if (!M.state.completed.includes(def.id)) M.state.completed.push(def.id);
    M.state.next = Math.max(M.state.next, MISSIONS.indexOf(def) + 1);
    M.state.rep += def.reward.rep || 0;
    G.player.addMoney(def.reward.money);
    G.player.maxHealth = 100 + Math.min(100, M.state.rep * 8);
    G.player.heal(40);
    G.audio?.missionPass();
    G.hud.banner('MISSION PASSED', `${def.title}   +$${def.reward.money.toLocaleString()}`, 'pass');
    G.events.emit('missionPassed', def);
    if (def.finale) {
      M.finished = true;
      setTimeout(() => G.menus?.showEnding?.(), 4500);
    }
    G.save?.auto('Mission passed');
    M.refreshMarkers();
  }

  M.fail = (reason) => {
    const m = M.active;
    if (!m) return;
    const def = m.def;
    // clear mission-spawned hostile targets so a retry starts clean
    for (const a of m.enemies || []) if (!a.removed) G.actors.remove(a);
    if (m.vehicle && G.player.vehicle !== m.vehicle && !m.vehicle.removed) { m.vehicle.mission = false; }
    if (m.chaseVehicle && !m.chaseVehicle.removed) { if (m.chaseVehicle.occupant) G.actors.remove(m.chaseVehicle.occupant); G.vehicles.remove(m.chaseVehicle); }
    endMission(m);
    G.audio?.missionFail();
    G.hud.banner('MISSION FAILED', reason, 'fail');
    G.events.emit('missionFailed', def, reason);
    M.refreshMarkers();
  };

  M.abort = () => {
    const m = M.active;
    if (!m) return;
    for (const a of m.enemies || []) if (!a.removed) G.actors.remove(a);
    endMission(m);
    M.refreshMarkers();
  };

  M.update = (dt) => {
    const m = M.active;
    if (m) {
      m.t += dt;
      const step = m.steps[m.stepIndex];
      const r = step.update(m, dt);
      if (r === 'done') advance(m);
      else if (r && r.fail) M.fail(r.fail);
      return;
    }
    // idle: watch the start marker
    const mk = M.startMarker;
    if (mk) {
      const P = G.player;
      const d = Math.hypot(P.x - mk.x, P.z - mk.z);
      if (d < 4 && !P.dead) {
        if (G.wanted.stars > 0) {
          G.hud.hint('Lose the police before starting a mission');
        } else {
          M.start(MISSIONS[M.state.next]);
        }
      }
    }
  };

  M.objectiveInfo = () => {
    const m = M.active;
    if (!m || !m.objective) return null;
    return { title: m.def.title, text: m.objective.text, x: m.objective.x, z: m.objective.z, timer: m.timer, progress: m.progress };
  };

  G.events.on('playerDied', () => { if (M.active) M.fail('You died.'); });
  G.events.on('playerBusted', () => { if (M.active) M.fail('You were busted.'); });

  M.serialize = () => ({ ...M.state });
  M.restore = (s) => {
    M.state = { next: s?.next ?? 0, completed: s?.completed ?? [], rep: s?.rep ?? 0 };
    M.finished = M.state.next >= MISSIONS.length;
    M.active = null;
    M.refreshMarkers();
  };
  return M;
}
