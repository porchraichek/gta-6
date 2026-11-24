// Wanted level: witnessed crimes add heat, heat becomes 1-5 stars. When officers lose sight of the player a search area opens;
// staying out of sight long enough (faster outside the area or in a different vehicle) clears the stars.
import { createPoliceRadio, vehicleDescription } from './policeRadio.js';
import { copWitness, civilianWitness } from './policeSight.js';

const THRESH = [0, 20, 70, 150, 260, 400];
const MAX_HEAT = 540;
const LOST_GRACE = 1.5; // seconds unseen before units fall back to searching (the HUD stars blink from here)
const PHONE_DELAY = 2.5; // civilians need a moment to call a crime in
const CRIME_COOLDOWN = 2.5;
const DISPATCH_TRACKING = 7; // seconds a known suspect stays tracked even with no unit in sight yet

const CRIME_WORDS = {
  murder: 'a homicide', 'cop-murder': 'an officer down', assault: 'an assault', copassault: 'an assault on an officer',
  carjack: 'a carjacking', 'carjack-cop': 'a stolen patrol car', cartheft: 'a vehicle theft', gunfire: 'shots fired',
  hitped: 'a hit-and-run', 'rammed-cop': 'a patrol car rammed', hitandrun: 'a collision', explosion: 'an explosion',
};
const LEVEL_CALLOUTS = [
  '',
  '',
  'Suspect is not stopping. Units cleared to box in and PIT the vehicle.',
  'Air One is up. Roadblocks authorized on all main roads.',
  'SWAT teams rolling. Spike strips are out.',
  'All units, lethal force authorized. Armored response en route.',
];

export function createWanted(G) {
  const W = {
    heat: 0, stars: 0, unseen: 0, seen: false, flash: 0, cooldownFlag: {},
    // search area for the minimap: active while units have lost sight of the suspect
    search: { active: false, x: 0, z: 0, radius: 0 },
    lastSeen: { x: 0, z: 0 },
    evadeT: 0, evadeNeed: 1, descriptionStale: false, suspectVehicle: null, trackT: 0,
  };
  W.radio = createPoliceRadio(G);
  const reports = [];
  const isPlayer = (a) => a === G.player.actor || a === 'player';

  W.starsFor = (heat) => {
    let s = 0;
    for (let i = 1; i < THRESH.length; i++) if (heat >= THRESH[i]) s = i;
    return s;
  };
  Object.defineProperty(W, 'flashing', { get: () => W.stars > 0 && W.search.active });

  // An officer has eyes on the player this frame.
  W.spot = () => { W.seen = true; };

  // the police know exactly where the suspect is; dispatch keeps tracking for a few seconds so units can arrive
  function knowExactly() {
    const P = G.player;
    W.lastSeen.x = P.x; W.lastSeen.z = P.z;
    W.unseen = 0;
    W.seen = true;
    W.trackT = DISPATCH_TRACKING;
  }

  function addHeat(kind, weight, x, z, known) {
    const before = W.stars;
    W.heat = Math.min(MAX_HEAT, W.heat + weight);
    W.stars = W.starsFor(W.heat);
    if (known) knowExactly();
    else if (before === 0 && W.stars > 0) {
      // only a report: the police know where it happened, not where the suspect is now
      W.lastSeen.x = x; W.lastSeen.z = z;
      W.unseen = LOST_GRACE + 0.01;
      W.suspectVehicle = G.player.mode === 'car' ? G.player.vehicle : null;
      W.descriptionStale = false;
      startSearch(x, z);
    }
    if (W.stars > before) onChange(before, kind, x, z, known);
  }

  // Register a crime. opts: true (force: the police learn of it regardless) or { force, copsOnly }.
  W.crime = (kind, weight, x, z, opts = false) => {
    if (G.noWanted) return;
    const force = opts === true || !!opts.force, copsOnly = !!opts.copsOnly;
    const now = G.time;
    if (W.cooldownFlag[kind] && now - W.cooldownFlag[kind] < CRIME_COOLDOWN && kind !== 'murder' && kind !== 'cop-murder') return;
    W.cooldownFlag[kind] = now;
    x ??= G.player.x; z ??= G.player.z;
    if (copWitness(G, x, z)) { addHeat(kind, weight, x, z, true); return; }
    if (force) { addHeat(kind, weight, x, z, false); return; }
    if (!copsOnly && civilianWitness(G, x, z)) reports.push({ kind, weight, x, z, t: PHONE_DELAY });
  };

  W.setStars = (n) => {
    const before = W.stars;
    W.heat = Math.max(W.heat, THRESH[n] + 2);
    W.stars = W.starsFor(W.heat);
    knowExactly();
    W.search.active = false;
    if (W.stars !== before) onChange(before);
  };

  W.clear = () => {
    const before = W.stars;
    W.heat = 0;
    W.stars = 0;
    W.unseen = 0;
    W.trackT = 0;
    W.search.active = false;
    W.descriptionStale = false;
    reports.length = 0;
    if (before) onChange(before);
  };

  function onChange(before, kind, x, z, known) {
    G.events.emit('wantedChanged', W.stars, before);
    const R = W.radio;
    if (W.stars > before) {
      G.audio?.wantedUp();
      G.hud?.notify(`Wanted level ${W.stars}`, 'warn');
      if (before === 0) {
        const what = CRIME_WORDS[kind];
        const px = x ?? G.player.x, pz = z ?? G.player.z;
        if (!what) R.say(`All units, be on the lookout ${R.where(px, pz)}. Suspect ${R.suspect()}.`, { urgent: true });
        else if (known === false) R.say(`Caller reports ${what} ${R.where(px, pz)}. Units, search the area.`, { urgent: true });
        else R.say(`All units, ${what} ${R.where(px, pz)}. Suspect ${R.suspect()}.`, { urgent: true });
      }
      for (let s = Math.max(before + 1, 2); s <= W.stars; s++) R.say(LEVEL_CALLOUTS[s]);
    } else if (W.stars === 0) {
      G.hud?.notify('Wanted level cleared. You lost them.', 'good');
      R.say('All units, suspect lost. Resume patrol.');
    }
  }

  function startSearch(x, z) {
    const s = W.search;
    s.active = true;
    s.x = x; s.z = z;
    s.radius = 50 + W.stars * 14;
    W.evadeT = 0;
    W.evadeNeed = 8 + W.stars * 3;
  }

  function lose() {
    W.heat = 0;
    const before = W.stars;
    W.stars = 0;
    W.search.active = false;
    W.descriptionStale = false;
    onChange(before);
  }

  W.update = (dt) => {
    W.flash += dt;
    W.radio.update(dt);
    for (let i = reports.length - 1; i >= 0; i--) {
      const r = reports[i];
      if ((r.t -= dt) <= 0) { reports.splice(i, 1); addHeat(r.kind, r.weight, r.x, r.z, false); }
    }
    if (W.stars === 0) {
      W.heat = Math.max(0, W.heat - dt * 6);
      W.search.active = false;
      W.seen = false;
      return;
    }
    const P = G.player;
    const veh = P.mode === 'car' ? P.vehicle : null;
    if (W.trackT > 0) { W.trackT -= dt; W.seen = true; }
    if (W.seen) {
      if (W.search.active) W.radio.say(`Visual on suspect ${W.radio.where(P.x, P.z)}, ${W.radio.suspect()}!`, { from: 'unit' });
      W.search.active = false;
      W.unseen = 0;
      W.lastSeen.x = P.x; W.lastSeen.z = P.z;
      W.suspectVehicle = veh;
      W.descriptionStale = false;
    } else W.unseen += dt;
    W.seen = false;

    if (!W.search.active && W.unseen > LOST_GRACE) {
      startSearch(W.lastSeen.x, W.lastSeen.z);
      W.radio.say(`Lost visual ${W.radio.where(W.lastSeen.x, W.lastSeen.z)}. Units, set up a perimeter and search.`, { from: 'unit' });
    }
    if (!W.search.active) return;

    const s = W.search;
    // the area creeps a little towards where the suspect really is: sitting still inside it is risky
    const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz);
    const creep = Math.min(d, (0.3 + W.stars * 0.25) * dt);
    if (d > 0.01) { s.x += (dx / d) * creep; s.z += (dz / d) * creep; }
    if (!W.descriptionStale && veh !== W.suspectVehicle) {
      W.descriptionStale = true;
      W.radio.say(veh ? `Suspect may have switched vehicles. Possibly a ${vehicleDescription(veh)}.` : 'Suspect vehicle found abandoned. Suspect is on foot.');
    }
    const inside = d < s.radius;
    W.evadeT += dt * (inside ? 0.35 : 1) * (W.descriptionStale ? 1.6 : 1);
    if (W.evadeT >= W.evadeNeed) lose();
  };

  // 0..1 progress towards losing the police (0 while they can see you)
  W.evasion = () => (W.stars && W.search.active ? Math.min(1, W.evadeT / W.evadeNeed) : 0);

  // ---- crime detection
  G.events.on('actorKilled', (a, attacker) => {
    if (!isPlayer(attacker)) return;
    G.player.stats.kills++;
    if (a.kind === 'cop') {
      W.crime('cop-murder', 160, a.x, a.z, true);
      W.radio.say(`Officer down ${W.radio.where(a.x, a.z)}! All units respond!`, { from: 'unit', urgent: true });
    } else if (a.kind === 'ped') W.crime('murder', 45, a.x, a.z);
    else if (a.team === 'gang') W.crime('gangkill', 6, a.x, a.z);
  });
  G.events.on('actorHit', (a, attacker) => {
    if (!isPlayer(attacker) || a.dead) return;
    const byCar = attacker === 'player'; // vehicles report the string 'player', weapons the player's actor
    if (a.kind === 'cop') W.crime('copassault', 60, a.x, a.z, true);
    else if (a.kind === 'ped') W.crime(byCar ? 'hitped' : 'assault', byCar ? 18 : 14, a.x, a.z);
  });
  G.events.on('carjack', (v) => {
    if (v.kind === 'police') W.crime('carjack-cop', 80, v.x, v.z, true);
    else W.crime('carjack', 24, v.x, v.z);
  });
  // breaking into a parked car only counts if an officer sees it
  G.events.on('enterVehicle', (v) => {
    if (v.parked && !v.playerOwned && !v.mission && v.kind === 'civil' && !v.stolen) {
      v.stolen = true;
      W.crime('cartheft', 22, v.x, v.z, { copsOnly: true });
    }
  });
  G.events.on('explosion', (x, z, attacker) => {
    if (isPlayer(attacker)) W.crime('explosion', 45, x, z);
  });
  G.events.on('gunshot', (attacker, x, z) => {
    if (isPlayer(attacker)) W.crime('gunfire', 14, x, z);
  });
  G.events.on('vehicleCollision', (a, b, imp) => {
    const other = a.driver === 'player' ? b : b.driver === 'player' ? a : null;
    if (!other || imp < 6) return;
    // being PIT-ed by a pursuing cruiser is not the player's crime: only count it when the player is the faster car
    const mine = other === a ? b : a;
    if (other.kind === 'police' && mine.speed > other.speed) W.crime('rammed-cop', 40, other.x, other.z, true);
    else if (other.kind === 'police') return;
    else W.crime('hitandrun', 8, other.x, other.z);
  });
  G.events.on('vehicleExploded', (v) => {
    if (v.lastAttacker === 'player' || (v.driver === 'player')) {
      G.player.stats.wrecked++;
      W.crime('explosion', 30, v.x, v.z);
    }
  });

  return W;
}
