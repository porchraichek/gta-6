// Wanted level: crimes add "heat", heat becomes 1-5 stars, and heat cools off once the police lose sight of you.

const THRESH = [0, 20, 70, 150, 260, 400];

export function createWanted(G) {
  const W = { heat: 0, stars: 0, unseen: 0, seen: false, cooldownFlag: {}, flash: 0 };

  const isPlayer = (a) => a === G.player.actor || a === 'player';

  W.starsFor = (heat) => {
    let s = 0;
    for (let i = 1; i < THRESH.length; i++) if (heat >= THRESH[i]) s = i;
    return s;
  };

  function witnessed(x, z) {
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle && a.kind !== 'cop') continue;
      if (a.kind === 'cop' && Math.hypot(a.x - x, a.z - z) < 85) return true;
      if (a.kind === 'ped' && Math.hypot(a.x - x, a.z - z) < 32) return true;
    }
    for (const v of G.vehicles.list) {
      if (v.kind === 'police' && !v.dead && Math.hypot(v.x - x, v.z - z) < 90) return true;
    }
    return false;
  }

  W.crime = (kind, weight, x, z, force = false) => {
    if (G.noWanted) return;
    const now = G.time;
    if (W.cooldownFlag[kind] && now - W.cooldownFlag[kind] < 2.5 && kind !== 'murder') return;
    W.cooldownFlag[kind] = now;
    if (!force && !witnessed(x ?? G.player.x, z ?? G.player.z)) return;
    const before = W.stars;
    W.heat = Math.min(540, W.heat + weight);
    W.unseen = 0;
    W.stars = W.starsFor(W.heat);
    if (W.stars > before) onChange(before);
  };

  W.setStars = (n) => {
    const before = W.stars;
    W.heat = Math.max(W.heat, THRESH[n] + 2);
    W.stars = W.starsFor(W.heat);
    if (W.stars !== before) onChange(before);
  };
  W.clear = () => {
    const before = W.stars;
    W.heat = 0;
    W.stars = 0;
    W.unseen = 0;
    if (before) onChange(before);
  };

  function onChange(before) {
    G.events.emit('wantedChanged', W.stars, before);
    if (W.stars > before) {
      G.audio?.wantedUp();
      G.hud?.notify(W.stars === 1 ? 'Wanted! Police have been alerted.' : `Wanted level ${W.stars}`, 'warn');
    } else if (W.stars === 0) {
      G.hud?.notify('Wanted level cleared. You lost them.', 'good');
    }
  }

  W.update = (dt) => {
    W.flash += dt;
    if (W.stars === 0) { W.heat = Math.max(0, W.heat - dt * 6); return; }
    if (W.seen) W.unseen = 0;
    else W.unseen += dt;
    W.seen = false;
    // cool off only when no cop has seen you for a while
    if (W.unseen > 9) {
      const before = W.stars;
      W.heat -= dt * (10 + W.stars * 3);
      if (W.heat <= 0) W.heat = 0;
      W.stars = W.starsFor(W.heat);
      if (W.stars !== before) {
        // never step all the way down while still next to a cruiser
        if (W.stars < before) onChange(before);
      }
    }
  };

  W.evasion = () => (W.stars ? Math.min(1, W.unseen / 9) : 0);

  // ---- crime detection
  G.events.on('actorKilled', (a, attacker) => {
    if (!isPlayer(attacker)) return;
    G.player.stats.kills++;
    if (a.kind === 'cop') W.crime('murder', 140, a.x, a.z, true);
    else if (a.kind === 'ped') W.crime('murder', 45, a.x, a.z);
    else if (a.team === 'gang') W.crime('gangkill', 6, a.x, a.z);
  });
  G.events.on('actorHit', (a, attacker, amount) => {
    if (!isPlayer(attacker)) return;
    if (a.kind === 'cop') W.crime('copassault', 60, a.x, a.z, true);
    else if (a.kind === 'ped') W.crime('assault', 14, a.x, a.z);
  });
  G.events.on('carjack', (v) => {
    if (v.kind === 'police') W.crime('carjack-cop', 80, v.x, v.z, true);
    else W.crime('carjack', 24, v.x, v.z);
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
    if (other.kind === 'police') W.crime('rammed-cop', 40, other.x, other.z, true);
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
