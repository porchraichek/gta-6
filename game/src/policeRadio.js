// Police radio chatter: short dispatch callouts ("suspect in a red Vesper RS heading north through Cobalt Row") shown as HUD notifications.
import { DISTRICTS, HALF, PITCH, N } from './config.js';
import { districtOf } from './citygen.js';
import { rand } from './random.js';

const COLOR_NAMES = [
  [0xe63946, 'red'], [0xf4a261, 'orange'], [0xffd166, 'yellow'], [0x2a9d8f, 'teal'], [0x3a86ff, 'blue'], [0xf1faee, 'white'],
  [0x1d3557, 'navy'], [0xff6fb5, 'pink'], [0x8338ec, 'purple'], [0x2b2d42, 'charcoal'], [0xc0c7cf, 'silver'], [0x06d6a0, 'green'],
  [0x111111, 'black'], [0x1b2d52, 'police'], [0xdddddd, 'white'],
];
// landmarks dispatch may name ('spray' is left out on purpose: it's where suspects hide, not a reference point)
const CALLOUT_LANDMARKS = ['diner', 'garage', 'arms', 'hospital', 'police', 'casino', 'bank', 'yacht', 'docks', 'villa', 'race'];
const MIN_GAP = 3.2; // seconds between two callouts
const MAX_AGE = 9; // callouts older than this are dropped instead of read late

export function colorName(hex) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  let best = 'grey', bd = Infinity;
  for (const [h, name] of COLOR_NAMES) {
    const d = (r - ((h >> 16) & 255)) ** 2 + (g - ((h >> 8) & 255)) ** 2 + (b - (h & 255)) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

export function districtNameAt(x, z) {
  const bi = Math.floor((x + HALF) / PITCH), bj = Math.floor((z + HALF) / PITCH);
  if (bi >= 0 && bi < N && bj >= 0 && bj < N) return DISTRICTS[districtOf(bi, bj)].name;
  return x > HALF ? 'Coral Beach' : 'the shoreline';
}

// 8-way compass word for a velocity; north is -z, east is +x.
export function compassWord(vx, vz) {
  const words = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const a = Math.atan2(vx, -vz);
  return words[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

export function vehicleDescription(v) {
  return `${colorName(v.model.bodyMat.color.getHex())} ${v.def.name}`;
}

export function createPoliceRadio(G) {
  const R = { log: [] };
  const queue = [];
  let gap = 0;
  const callsign = () => ['Unit', 'Adam', 'Lincoln', 'Bravo'][Math.floor(rand() * 4)] + ' ' + (2 + Math.floor(rand() * 30));

  // "in Cobalt Row" or "near Lucky Palm Casino"
  R.where = (x, z) => {
    const lms = G.city.landmarks;
    for (const id of CALLOUT_LANDMARKS) {
      const lm = lms[id];
      if (lm && Math.hypot(lm.x - x, lm.z - z) < 70) return `near ${lm.name}`;
    }
    return `in ${districtNameAt(x, z)}`;
  };

  // "in a red Vesper RS heading north" / "on foot heading east" / "on foot"
  R.suspect = () => {
    const P = G.player;
    const v = P.mode === 'car' ? P.vehicle : null;
    const vx = v ? v.vx : P.actor.vx, vz = v ? v.vz : P.actor.vz;
    const moving = Math.hypot(vx, vz) > (v ? 4 : 1.5);
    const what = v ? `in a ${vehicleDescription(v)}` : 'on foot';
    return moving ? `${what} heading ${compassWord(vx, vz)}` : what;
  };

  R.say = (text, { from = 'Dispatch', urgent = false } = {}) => {
    if (G.state !== 'play') return;
    const item = { text: `${from === 'unit' ? callsign() : from}: ${text}`, t: G.time };
    if (urgent) queue.unshift(item); else queue.push(item);
    if (queue.length > 3) queue.length = 3;
  };

  R.update = (dt) => {
    gap -= dt;
    while (queue.length && G.time - queue[0].t > MAX_AGE) queue.shift();
    if (gap > 0 || !queue.length || !G.hud) return;
    const item = queue.shift();
    G.hud.notify(item.text, 'radio');
    R.log.push(item.text);
    if (R.log.length > 12) R.log.shift();
    gap = MIN_GAP;
  };

  R.clear = () => { queue.length = 0; gap = 0; };
  return R;
}
