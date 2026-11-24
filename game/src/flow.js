// Life-cycle flow: WASTED / BUSTED screens and respawn at the hospital or police station.

export function createFlow(G) {
  const F = { timer: 0, mode: null };

  function spot(id) {
    const l = G.city.landmarks[id];
    return { x: l.x, z: l.z - 3, heading: Math.PI };
  }

  G.events.on('playerDied', () => {
    F.mode = 'wasted';
    F.timer = 4.2;
    G.hud.deathScreen('WASTED', 'Palmera Bay shrugs.');
    G.audio?.missionFail();
  });
  G.events.on('playerBusted', () => {
    if (G.player.dead) return;
    G.player.dead = true;
    G.player.deadT = 0;
    F.mode = 'busted';
    F.timer = 3.6;
    G.hud.deathScreen('BUSTED', 'Booked, fined, and released.');
  });

  F.update = (dt) => {
    if (!F.mode) return;
    F.timer -= dt;
    if (F.timer > 0) return;
    const reason = F.mode === 'busted' ? 'busted' : 'wasted';
    const place = F.mode === 'busted' ? 'police' : 'hospital';
    F.mode = null;
    G.hud.hideDeath();
    G.player.actor.model.group.rotation.x = 0;
    G.player.respawn(spot(place), reason);
    G.camera3.snap();
  };

  return F;
}
