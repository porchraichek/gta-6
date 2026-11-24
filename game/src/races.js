// Street race activity: countdown, checkpoint loop through the city, AI rivals, positions and prize money.
import { nodeX, nodeZ } from './roadnet.js';
import { driveToward } from './vehicleAI.js';
import { CAR_COLORS } from './config.js';
import { rand } from './random.js';

const LOOP = [[4, 10], [8, 10], [8, 7], [10, 7], [10, 3], [6, 3], [6, 6], [3, 6], [3, 9], [4, 10]];
const PRIZES = [2000, 900, 350];

export function createRaces(G) {
  const R = { active: null, startMarker: null, wins: 0, best: null };

  R.setupMarker = () => {
    if (R.startMarker) G.markers.remove(R.startMarker);
    const lm = G.city.landmarks.race;
    R.startMarker = G.markers.add({ x: lm.x, z: lm.z, color: 0xb388ff, radius: 3.4, blip: true, icon: 'race', label: 'Street Race', pillar: true, height: 35 });
  };

  R.start = () => {
    const P = G.player;
    if (R.active || G.missions.active) return;
    if (P.mode !== 'car') { G.hud.hint('Get in a car to join the Neon Lap street race'); return; }
    const lm = G.city.landmarks.race;
    const pts = LOOP.map(([i, j]) => [nodeX(i), nodeZ(j)]);
    const v = P.vehicle;
    // grid: place the player and rivals on the road in front of the garage
    const roadZ = nodeZ(10);
    const cars = [];
    v.x = nodeX(4) - 44; v.z = roadZ + 4.5; v.heading = Math.PI / 2; v.vx = v.vz = 0; v.fwd = 0;
    G.camera3.snap();
    const types = ['sports', 'sedan', 'compact'];
    for (let k = 0; k < 3; k++) {
      const c = G.vehicles.spawn(types[k], nodeX(4) - 44 - (k + 1) * 8, roadZ + (k % 2 ? -4.5 : 4.5), Math.PI / 2, { color: CAR_COLORS[(k * 3 + 1) % CAR_COLORS.length], mission: true });
      c.driver = 'ai';
      c.ai = { type: 'racer', state: {} };
      cars.push({ v: c, cp: 1, lap: 0, finished: false, place: 0, skill: 0.78 + rand() * 0.12 });
    }
    R.active = { pts, player: { cp: 1, finished: false }, cars, countdown: 4, t: 0, markers: [], place: 4, started: false, lm };
    placeMarkers();
    G.hud.banner('STREET RACE', 'Neon Lap: 9 checkpoints. Win for cash.', 'mission');
    if (R.startMarker) { G.markers.remove(R.startMarker); R.startMarker = null; }
  };

  function placeMarkers() {
    const r = R.active;
    for (const m of r.markers) G.markers.remove(m);
    r.markers = [];
    const cp = r.player.cp;
    if (cp >= r.pts.length) return;
    const p = r.pts[cp];
    r.markers.push(G.markers.add({ x: p[0], z: p[1], color: 0xb388ff, radius: 9, blip: true, icon: 'obj', pillar: true, height: 40 }));
    if (cp + 1 < r.pts.length) {
      const q = r.pts[cp + 1];
      r.markers.push(G.markers.add({ x: q[0], z: q[1], color: 0x7a5cc4, radius: 6, blip: true, icon: 'obj', pillar: false }));
    }
  }

  function progress(ent, pts) {
    const p = pts[Math.min(ent.cp, pts.length - 1)];
    const d = Math.hypot(ent.x - p[0], ent.z - p[1]);
    return ent.cp * 1000 - d;
  }

  R.update = (dt) => {
    const r = R.active;
    const P = G.player;
    if (!r) return;
    if (r.countdown > 0) {
      const prev = Math.ceil(r.countdown);
      r.countdown -= dt;
      const now = Math.ceil(r.countdown);
      if (now !== prev) { G.hud.centerText(now > 0 ? String(now) : 'GO!'); G.audio?.uiSelect(); }
      for (const c of r.cars) { c.v.input.handbrake = true; c.v.input.throttle = 0; }
      if (P.mode === 'car') { P.vehicle.input.handbrake = true; P.vehicle.input.throttle = 0; }
      if (r.countdown <= 0) r.started = true;
      return;
    }
    r.t += dt;
    for (const c of r.cars) {
      if (c.finished) { c.v.input.throttle = 0; c.v.input.handbrake = true; continue; }
      const pt = r.pts[Math.min(c.cp, r.pts.length - 1)];
      const d = driveToward(G, c.v, c.v.ai.state, pt[0], pt[1], { speed: c.v.def.maxSpeed * c.skill * rubber(c) });
      if (d < 16) { c.cp++; if (c.cp >= r.pts.length) { c.finished = true; c.time = r.t; } }
    }
    // player checkpoints
    if (!r.player.finished) {
      if (P.mode === 'car') {
        const pt = r.pts[r.player.cp];
        if (Math.hypot(P.x - pt[0], P.z - pt[1]) < 12) {
          r.player.cp++;
          G.audio?.pickup();
          if (r.player.cp >= r.pts.length) finish(true);
          else placeMarkers();
        }
        r.leftT = 0;
      } else {
        r.leftT = (r.leftT || 0) + dt;
        if (r.leftT > 12) return abort('You left the race.');
      }
    }
    // standings
    const me = { cp: r.player.cp, x: P.x, z: P.z };
    const mine = progress(me, r.pts);
    let ahead = 0;
    for (const c of r.cars) {
      const score = c.finished ? 1e6 - c.time : progress({ cp: c.cp, x: c.v.x, z: c.v.z }, r.pts);
      if (score > mine) ahead++;
    }
    r.place = ahead + 1;
    if (!r.player.finished) {
      // if a rival finishes first the race ends for the player after a short grace period
      const done = r.cars.filter((c) => c.finished).length;
      if (done >= 3) finish(false);
    }
  };

  function rubber(c) {
    const r = R.active, P = G.player;
    const my = r.player.cp * 1000 - 0;
    const them = c.cp * 1000;
    return 1 + Math.max(-0.12, Math.min(0.15, (my - them) * 0.0002));
  }

  function finish(won) {
    const r = R.active;
    r.player.finished = true;
    const place = r.cars.filter((c) => c.finished).length + 1;
    const prize = PRIZES[Math.min(2, place - 1)] ?? 0;
    G.player.addMoney(prize);
    if (place === 1) R.wins++;
    G.audio?.missionPass();
    G.hud.banner(place === 1 ? 'RACE WON' : `FINISHED ${place}${place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH'}`, `Time ${r.t.toFixed(1)}s   +$${prize}`, 'pass');
    if (R.best === null || r.t < R.best) R.best = r.t;
    cleanup();
    void won;
  }

  function abort(msg) {
    G.hud.banner('RACE OVER', msg, 'fail');
    cleanup();
  }

  function cleanup() {
    const r = R.active;
    if (!r) return;
    for (const m of r.markers) G.markers.remove(m);
    for (const c of r.cars) { c.v.mission = false; c.v.ai = null; c.v.driver = null; c.v.input.handbrake = true; }
    R.active = null;
    R.setupMarker();
    G.save?.auto('Race');
  }

  R.abort = () => {
    if (R.active) cleanup();
  };

  R.updateIdle = () => {
    const mk = R.startMarker;
    if (!mk || R.active) return;
    const P = G.player;
    if (Math.hypot(P.x - mk.x, P.z - mk.z) < 4.2 && !P.dead) R.start();
  };

  G.events.on('playerDied', () => { if (R.active) abort('You died.'); });
  G.events.on('playerBusted', () => { if (R.active) abort('Busted.'); });

  R.info = () => {
    const r = R.active;
    if (!r) return null;
    return { place: r.place, cp: Math.min(r.player.cp, r.pts.length - 1), total: r.pts.length - 1, t: r.t, countdown: r.countdown };
  };
  return R;
}
