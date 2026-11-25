// One-shot procedural sound effects: weapons, reloads, impacts, footsteps, pickups, UI and mission stings.
// Everything is synthesized from oscillators + filtered noise via the audio engine helpers.

// per-class horn pitch pairs (Hz)
const HORNS = {
  compact: [520, 655], sedan: [415, 523], sports: [470, 592], pickup: [330, 415],
  van: [300, 380], cruiser: [370, 466], swat: [233, 294], default: [415, 523],
};

export function createSfx(E) {
  const S = {};
  const noise = E.noise, tone = E.tone;
  // farther sounds lose their highs (air absorption)
  const air = (sp) => 1 / (1 + sp.dist / 90);

  // ---------- weapons
  const GUNS = {
    pistol(sp, mine) {
      const a = air(sp);
      noise(0.11, { sp, f0: 5200 * a + 600, f1: 700, gain: 0.7, q: 0.9, rev: 0.3 });
      tone(170, 0.11, { sp, type: 'triangle', f1: 55, gain: 0.5 });
      noise(0.4, { sp, f0: 1400 * a + 200, f1: 150, gain: 0.16, at: 0.015, rev: 0.4 });
      if (mine) noise(0.03, { type: 'highpass', f0: 6000, gain: 0.12, at: 0.06, pan: 0 }); // slide clack
    },
    smg(sp) {
      const a = air(sp);
      noise(0.07, { sp, f0: 6500 * a + 600, f1: 1200, gain: 0.55, rev: 0.18 });
      tone(210, 0.07, { sp, type: 'square', f1: 80, gain: 0.22, lp: 1400 });
      noise(0.18, { sp, f0: 1200 * a + 200, f1: 200, gain: 0.1, at: 0.01 });
    },
    shotgun(sp, mine) {
      const a = air(sp);
      noise(0.5, { sp, f0: 4200 * a + 400, f1: 120, gain: 0.95, rev: 0.45 });
      tone(95, 0.34, { sp, type: 'sine', f1: 36, gain: 0.85 });
      noise(0.9, { sp, f0: 700, f1: 90, gain: 0.25, at: 0.03, rev: 0.5 });
      if (mine) { // pump rack
        noise(0.06, { type: 'bandpass', f0: 1800, q: 3, gain: 0.25, at: 0.42, pan: 0 });
        noise(0.07, { type: 'bandpass', f0: 1200, q: 3, gain: 0.3, at: 0.58, pan: 0 });
      }
    },
    rifle(sp) {
      const a = air(sp);
      noise(0.14, { sp, f0: 7000 * a + 800, f1: 900, gain: 0.8, q: 1.1, rev: 0.35 });
      tone(130, 0.16, { sp, type: 'sawtooth', f1: 48, gain: 0.35, lp: 900 });
      noise(0.7, { sp, f0: 1100 * a + 150, f1: 110, gain: 0.22, at: 0.02, rev: 0.5 });
    },
    sniper(sp, mine) {
      const a = air(sp);
      noise(0.035, { sp, type: 'highpass', f0: 3000, f1: 2000, gain: 0.9 }); // supersonic crack
      noise(0.3, { sp, f0: 3600 * a + 400, f1: 200, gain: 0.9, at: 0.01, rev: 0.5 });
      tone(70, 0.5, { sp, type: 'sine', f1: 30, gain: 0.9, at: 0.01 });
      noise(1.6, { sp, f0: 800, f1: 70, gain: 0.3, at: 0.05, rev: 0.7 });
      if (mine) noise(0.08, { type: 'bandpass', f0: 1500, q: 4, gain: 0.25, at: 0.7, pan: 0 }); // bolt
    },
  };

  // gunshot(type, x, z, isPlayer): type in pistol|smg|shotgun|rifle|sniper|explosion (unknown -> pistol)
  S.gunshot = (type, x, z, mine = false) => {
    if (!E.live()) return;
    if (type === 'explosion' || type === 'rocket' || type === 'grenade') return S.explosion(x, z);
    if (type === 'fists' || type === 'melee') return S.swing();
    const sp = mine ? { gain: 1, pan: 0, dist: 0 } : E.spatial(x, z, 55);
    (GUNS[type] || GUNS.pistol)(sp, mine);
  };

  // reload(type): mag out / in / slide, or shell inserts for a shotgun. Fits in ~1.1s.
  S.reload = (type = 'pistol') => {
    const click = (at, f, g = 0.2, q = 4) => noise(0.05, { type: 'bandpass', f0: f, f1: f * 0.8, q, gain: g, at, pan: 0 });
    if (type === 'shotgun') {
      for (let i = 0; i < 4; i++) { click(0.12 + i * 0.2, 900, 0.22); click(0.16 + i * 0.2, 2400, 0.1); }
      click(0.95, 1600, 0.28); click(1.05, 1100, 0.3);
      return;
    }
    click(0.05, 1300, 0.18);              // release
    noise(0.12, { type: 'bandpass', f0: 600, q: 2, gain: 0.12, at: 0.12, pan: 0 }); // mag slides out
    click(0.55, 900, 0.3);                // mag in
    click(0.58, 2600, 0.12);
    click(type === 'smg' || type === 'rifle' ? 0.85 : 0.9, 1800, 0.26); // charge / slide
    click(0.95, 1100, 0.28);
  };

  S.explosion = (x, z) => {
    const sp = E.spatial(x, z, 130);
    const a = air(sp);
    noise(0.08, { sp, type: 'highpass', f0: 1500, gain: 0.7 });
    noise(2.2, { sp, f0: 2200 * a + 300, f1: 50, gain: 1.0, attack: 0.01, rev: 0.6 });
    tone(62, 1.3, { sp, type: 'sine', f1: 24, gain: 1.0 });
    tone(41, 1.6, { sp, type: 'sawtooth', f1: 22, gain: 0.3, lp: 200 });
    for (let i = 0; i < 6; i++) noise(0.05, { sp, type: 'bandpass', f0: 1500 + Math.random() * 2500, q: 2, gain: 0.15, at: 0.25 + Math.random() * 1.1 });
  };

  // crash(k 0..1, x, z): metal crunch scaled by impact; glass on hard hits
  S.crash = (k, x, z) => {
    const sp = E.spatial(x, z, 45);
    noise(0.25 + k * 0.35, { sp, f0: 2600, f1: 180, gain: 0.35 + k * 0.5, rev: 0.25 });
    noise(0.2 + k * 0.2, { sp, type: 'bandpass', f0: 700, f1: 350, q: 3, gain: 0.3 + k * 0.4, at: 0.03 });
    tone(95, 0.22, { sp, type: 'sine', f1: 40, gain: 0.5 * k + 0.1 });
    const base = 180 + Math.random() * 120;
    for (const m of [1, 2.76, 5.4]) tone(base * m, 0.25 + k * 0.4, { sp, type: 'triangle', gain: 0.06 * k, at: 0.01 });
    if (k > 0.3) noise(0.15, { sp, type: 'bandpass', f0: 1100, q: 2, gain: 0.25 * k, at: 0.08 }); // crumple
    if (k > 0.6) S.glass(x, z, k);
  };

  S.glass = (x, z, k = 0.7) => {
    const sp = E.spatial(x, z, 35);
    noise(0.25, { sp, type: 'highpass', f0: 3500, f1: 6000, gain: 0.35 * k, rev: 0.3 });
    for (let i = 0; i < 7; i++) tone(2600 + Math.random() * 4200, 0.08 + Math.random() * 0.15, { sp, gain: 0.08 * k, at: 0.02 + Math.random() * 0.35 });
  };

  // body impact; also used for melee hits
  S.punch = (x, z, k = 0.7) => {
    const sp = E.spatial(x, z, 25);
    noise(0.03, { sp, type: 'highpass', f0: 2500, gain: 0.35 * k });
    noise(0.1, { sp, f0: 900, f1: 120, gain: 0.55 * k });
    tone(115, 0.12, { sp, type: 'sine', f1: 45, gain: 0.55 * k });
  };
  S.thud = (x, z, k = 0.6) => S.punch(x, z, k);
  S.swing = () => noise(0.14, { type: 'bandpass', f0: 500, f1: 1900, gain: 0.18, q: 1.4, pan: 0 });

  S.metalHit = (x, z) => {
    const sp = E.spatial(x, z, 30);
    noise(0.02, { sp, type: 'highpass', f0: 3000, gain: 0.3 });
    tone(1800 + Math.random() * 900, 0.18, { sp, type: 'sine', gain: 0.12 });
    tone(3100 + Math.random() * 600, 0.1, { sp, type: 'sine', gain: 0.06 });
  };
  S.ricochet = (x, z) => {
    const sp = E.spatial(x, z, 40);
    noise(0.02, { sp, type: 'highpass', f0: 2500, gain: 0.2 });
    tone(2400 + Math.random() * 800, 0.22, { sp, type: 'sine', f1: 800, gain: 0.1 });
  };

  // footstep(surface, k): surface 'road'|'grass'|'sand'; k = loudness (sprint ~1, walk ~0.6)
  S.footstep = (surface = 'road', k = 0.6, x, z) => {
    const sp = E.spatial(x, z, 12);
    const f = surface === 'sand' ? 700 : surface === 'grass' ? 1100 : 1900;
    noise(surface === 'sand' ? 0.12 : 0.06, { sp, type: 'bandpass', f0: f * (0.85 + Math.random() * 0.3), f1: f * 0.5, q: 1.2, gain: 0.14 * k });
    tone(80 + Math.random() * 20, 0.05, { sp, type: 'sine', f1: 50, gain: 0.12 * k });
  };

  S.hurt = () => {
    const f0 = 190 + Math.random() * 50;
    const ctx = E.ctx;
    if (!E.admit(0.2)) return;
    // tiny formant grunt: sawtooth through a vowel-ish bandpass
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.65, t + 0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(bp); bp.connect(g);
    E.route(g, { gain: 1, pan: 0 });
    o.start(t); o.stop(t + 0.25);
  };

  // ---------- vehicles: doors, horn, starter
  S.doorClose = () => {
    noise(0.1, { f0: 900, f1: 200, gain: 0.35, pan: 0 });
    tone(110, 0.1, { type: 'sine', f1: 60, gain: 0.3, pan: 0 });
  };
  S.doorOpen = () => {
    noise(0.05, { type: 'bandpass', f0: 1500, q: 3, gain: 0.2, pan: 0 });
    noise(0.12, { type: 'bandpass', f0: 600, q: 1.5, gain: 0.1, at: 0.04, pan: 0 });
  };
  S.engineStart = () => {
    for (let i = 0; i < 4; i++) noise(0.08, { type: 'bandpass', f0: 300, q: 2, gain: 0.25, at: i * 0.11, pan: 0 });
    tone(40, 0.5, { type: 'sawtooth', f1: 70, gain: 0.25, at: 0.42, lp: 500, pan: 0 });
  };

  // horn(once, x, z, vehicleType): player horn if no position; positionless traffic honks are placed "somewhere nearby"
  S.horn = (once, x, z, type) => {
    let sp;
    if (x !== undefined) sp = E.spatial(x, z, 40);
    else if (once) sp = { gain: 1, pan: 0, dist: 0 };
    else sp = { gain: 0.25 + Math.random() * 0.2, pan: Math.random() * 1.4 - 0.7, dist: 40 };
    if (!type && once) type = window.__game?.player?.vehicle?.type;
    const [a, b] = HORNS[type] || HORNS.default;
    const dur = once ? 0.42 : 0.2 + Math.random() * 0.3;
    const opt = { sp, type: 'sawtooth', gain: 0.16, lp: 2200, hold: dur - 0.05, attack: 0.01 };
    tone(a, dur, opt);
    tone(b, dur, { ...opt, gain: 0.12 });
    if (!once && Math.random() < 0.35) { tone(a, 0.15, { ...opt, at: dur + 0.12, hold: 0.1 }); tone(b, 0.15, { ...opt, gain: 0.12, at: dur + 0.12, hold: 0.1 }); }
  };

  // ---------- pickups / UI
  const ui = (f, d, g = 0.1, type = 'square', at = 0) => tone(f, d, { type, gain: g, at, pan: 0, lp: 5000 });
  S.click = () => ui(1400, 0.035, 0.07);
  S.uiMove = () => ui(950, 0.03, 0.045, 'triangle');
  S.uiSelect = () => { ui(620, 0.06, 0.09); ui(930, 0.09, 0.09, 'square', 0.05); };
  S.uiBack = () => { ui(700, 0.06, 0.08); ui(470, 0.09, 0.08, 'square', 0.05); };
  S.dialogue = () => ui(280 + Math.random() * 140, 0.045, 0.035);
  S.pickup = () => { [880, 1175, 1568].forEach((f, i) => ui(f, 0.14, 0.13, 'triangle', i * 0.06)); };
  S.cash = () => {
    noise(0.05, { type: 'bandpass', f0: 3000, q: 2, gain: 0.15, pan: 0 });
    ui(1975, 0.18, 0.09, 'triangle', 0.03);
    ui(2637, 0.3, 0.09, 'triangle', 0.09);
    ui(3951, 0.25, 0.04, 'sine', 0.12);
  };

  // stings
  const stab = (notes, at, d, g, type = 'sawtooth', lp = 2600) => notes.forEach((f) => tone(f, d, { type, gain: g, at, pan: 0, lp, attack: 0.01, hold: d * 0.4 }));
  S.wantedUp = () => {
    stab([110, 165, 220], 0, 0.7, 0.12, 'sawtooth', 900);
    tone(55, 0.8, { type: 'sine', gain: 0.35, pan: 0 });
    for (let i = 0; i < 2; i++) tone(700, 0.22, { type: 'square', f1: 1150, glide: 0.18, gain: 0.05, at: 0.12 + i * 0.24, lp: 2500, pan: 0 });
  };
  S.missionStart = () => {
    tone(49, 1.2, { type: 'sine', gain: 0.35, pan: 0 });
    stab([196, 233, 294], 0, 0.3, 0.07);
    stab([220, 262, 330], 0.22, 0.3, 0.07);
    stab([262, 330, 392, 523], 0.44, 1.1, 0.07, 'sawtooth', 3200);
    noise(1.0, { type: 'bandpass', f0: 400, f1: 3500, q: 1, gain: 0.08, pan: 0 });
  };
  S.missionPass = () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.2, at: i * 0.12, pan: 0 }));
    stab([262, 330, 392, 523, 659], 0.5, 1.6, 0.06, 'sawtooth', 3500);
    tone(65, 1.6, { type: 'sine', gain: 0.35, at: 0.5, pan: 0 });
    noise(0.5, { type: 'highpass', f0: 6000, gain: 0.08, at: 0.5, pan: 0 });
  };
  S.missionFail = () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, { type: 'sawtooth', gain: 0.12, at: i * 0.2, lp: 1500, pan: 0 }));
    tone(49, 1.4, { type: 'sine', gain: 0.4, at: 0.6, pan: 0 });
  };
  S.busted = () => {
    noise(0.4, { f0: 900, f1: 100, gain: 0.5, pan: 0 });
    stab([147, 175, 208], 0.05, 1.2, 0.09, 'square', 1200);
    for (let i = 0; i < 3; i++) tone(1300, 0.14, { type: 'square', f1: 900, gain: 0.04, at: 0.3 + i * 0.28, lp: 3000, pan: 0 });
  };

  return S;
}
