// Life-cycle flow: FLATLINED (death) and BOOKED (arrest) screens with a desaturated slow-motion beat, then a bill/fine receipt and respawn.

const DOWN_TIME = { dead: 4.2, arrest: 3.6 };
const RECEIPT_TIME = 2.6;
const DEATH_LINES = ['The bay keeps spinning without you.', 'Sunburn, lead poisoning, bad luck.', 'Somebody call the night shift.', 'Palmera Bay shrugs.'];
const ARREST_LINES = ['Hands on the hood. Again.', 'Detective Quint adds a page to your file.', 'You have the right to remain tanned.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createFlow(G) {
  // timeScale: optional slow-motion factor main.js may multiply into dt while the player is down
  const F = { timer: 0, mode: null, timeScale: 1 };

  function spot(id) {
    const l = G.city.landmarks[id];
    return { x: l.x, z: l.z - 3, heading: Math.PI };
  }

  function down(kind) {
    F.mode = kind;
    F.timer = DOWN_TIME[kind];
    F.timeScale = 0.3;
    if (kind === 'dead') G.hud.deathScreen('FLATLINED', pick(DEATH_LINES), 'dead');
    else G.hud.deathScreen('BOOKED', pick(ARREST_LINES), 'arrest');
  }

  G.events.on('playerDied', () => {
    down('dead');
    G.audio?.missionFail();
  });
  G.events.on('playerBusted', () => {
    if (G.player.dead) return;
    G.player.dead = true;
    G.player.deadT = 0;
    down('arrest');
  });

  F.update = (dt) => {
    if (!F.mode) { F.timeScale = 1; return; }
    F.timer -= dt;
    // slow-mo eases back towards normal speed while the card is shown
    F.timeScale = F.mode === 'receipt' ? 1 : Math.min(1, F.timeScale + dt * 0.12);
    if (F.timer > 0) return;
    if (F.mode === 'receipt') {
      F.mode = null;
      G.hud.hideDeath();
      return;
    }
    const arrested = F.mode === 'arrest';
    const before = G.player.money;
    G.player.actor.model.group.rotation.x = 0;
    G.player.respawn(spot(arrested ? 'police' : 'hospital'), arrested ? 'busted' : 'wasted');
    G.camera3.snap();
    const paid = Math.max(0, before - G.player.money);
    G.hud.deathBill(arrested ? 'COURT FINE' : 'HOSPITAL BILL', paid, arrested ? 'Weapons confiscated · released from Palmera PD' : 'Patched up at St. Aurelia Hospital');
    F.mode = 'receipt';
    F.timer = RECEIPT_TIME;
    F.timeScale = 1;
  };

  return F;
}
