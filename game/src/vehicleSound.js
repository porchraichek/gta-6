// Continuous vehicle voices: per-class engines with gears/revs (player car + nearest passing car),
// tyre screech, police siren (wail/yelp alternation) and the police helicopter rotor.
import { clamp } from './random.js';

// idle/red = firing frequency (Hz) at idle and redline; tops = top-speed fraction of each gear
const PROFILES = {
  compact: { idle: 30, red: 118, tops: [0.2, 0.4, 0.62, 0.82, 1], sub: 0.35, harm: 0.3, drive: 1.4, cut: 520, rasp: 0.25, vol: 0.85 },
  sedan: { idle: 26, red: 96, tops: [0.2, 0.4, 0.6, 0.8, 1], sub: 0.5, harm: 0.2, drive: 1.2, cut: 450, rasp: 0.15, vol: 0.85 },
  sports: { idle: 34, red: 165, tops: [0.14, 0.28, 0.44, 0.6, 0.8, 1], sub: 0.5, harm: 0.55, drive: 2.6, cut: 800, rasp: 0.35, vol: 1, pops: true },
  pickup: { idle: 20, red: 74, tops: [0.25, 0.5, 0.75, 1], sub: 0.9, harm: 0.15, drive: 2.2, cut: 380, rasp: 0.3, vol: 1 },
  van: { idle: 17, red: 62, tops: [0.25, 0.5, 0.75, 1], sub: 0.8, harm: 0.1, drive: 1.6, cut: 330, rasp: 0.55, vol: 0.95 },
  cruiser: { idle: 24, red: 120, tops: [0.18, 0.36, 0.56, 0.78, 1], sub: 0.7, harm: 0.35, drive: 2.2, cut: 600, rasp: 0.25, vol: 1 },
  swat: { idle: 15, red: 58, tops: [0.25, 0.5, 0.75, 1], sub: 1, harm: 0.1, drive: 2, cut: 300, rasp: 0.6, vol: 1.05 },
};

export function createVehicleSound(E) {
  const VS = {};
  let player, npc, squeal, siren, heli;

  // one engine voice: saw (firing) + square sub + saw harmonic + noise rasp -> soft clip -> lowpass -> gain -> pan
  function makeEngine() {
    const ctx = E.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sawtooth';
    const g2 = ctx.createGain(), g3 = ctx.createGain(), gn = ctx.createGain();
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.5;
    const ns = E.loopNoise();
    const pre = ctx.createGain();
    const shaper = ctx.createWaveShaper(); shaper.curve = E.softClip();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o1.connect(pre); o2.connect(g2); g2.connect(pre); o3.connect(g3); g3.connect(pre);
    ns.connect(nf); nf.connect(gn); gn.connect(pre);
    pre.connect(shaper); shaper.connect(lp); lp.connect(out);
    if (pan) { out.connect(pan); pan.connect(E.sfxBus); } else out.connect(E.sfxBus);
    o1.start(); o2.start(); o3.start();
    return { o1, o2, o3, g2, g3, gn, nf, pre, lp, out, pan, prof: null, gear: 0, rpm: 0, shiftT: 0, popT: 0, lastThrottle: 0 };
  }

  function setProfile(e, type) {
    const p = PROFILES[type] || PROFILES.sedan;
    if (e.prof === p) return;
    e.prof = p;
    E.set(e.g2.gain, p.sub, 0.02);
    E.set(e.g3.gain, p.harm, 0.02);
    E.set(e.gn.gain, p.rasp, 0.02);
    E.set(e.pre.gain, p.drive * 0.35, 0.02);
  }

  // simulated gearbox: speed fraction + throttle -> rpm 0..1, with a throttle dip on upshift
  function driveEngine(e, s, throttle, dt, gainMul, pitchMul = 1) {
    const p = e.prof;
    let g = 0;
    while (g < p.tops.length - 1 && s > p.tops[g]) g++;
    const lo = g ? p.tops[g - 1] : 0;
    const frac = clamp((s - lo) / (p.tops[g] - lo), 0, 1);
    let rpm = g === 0 ? Math.max(frac * 0.85, throttle * (s < 0.04 ? 0.55 : 0.2)) : 0.38 + frac * 0.62;
    if (g > e.gear) e.shiftT = 0.14;
    e.gear = g;
    e.shiftT = Math.max(0, e.shiftT - dt);
    const load = e.shiftT > 0 ? 0.15 : throttle;
    e.rpm = rpm;
    const f = (p.idle + (p.red - p.idle) * rpm) * pitchMul;
    const tc = e.shiftT > 0 ? 0.03 : 0.07;
    E.set(e.o1.frequency, f, tc);
    E.set(e.o2.frequency, f * 0.5, tc);
    E.set(e.o3.frequency, f * 2.01, tc);
    E.set(e.nf.frequency, f * 6, tc);
    E.set(e.lp.frequency, p.cut + rpm * 1500 + load * 700, 0.08);
    E.set(e.out.gain, p.vol * gainMul * (0.06 + load * 0.06 + rpm * 0.04), 0.06);
    // exhaust crackle on lift-off at high revs (sports cars)
    if (p.pops && e.lastThrottle > 0.5 && throttle < 0.2 && rpm > 0.6) e.popT = 0.6;
    e.lastThrottle = throttle;
    if (e.popT > 0) {
      e.popT -= dt;
      if (Math.random() < dt * 14) E.noise(0.04, { f0: 1200, f1: 300, gain: 0.25 * gainMul, pan: 0 });
    }
  }

  VS.build = () => {
    const ctx = E.ctx;
    player = makeEngine();
    npc = makeEngine();
    // tyre screech: two resonant bands of noise
    const sn = E.loopNoise();
    const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.Q.value = 9; b1.frequency.value = 1150;
    const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.Q.value = 12; b2.frequency.value = 2300;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sn.connect(b1); sn.connect(b2); b1.connect(sg); b2.connect(sg); sg.connect(E.sfxBus);
    squeal = { g: sg, b1, b2 };
    // siren: square through a lowpass; an LFO sweeps pitch; depth/rate switch between wail and yelp
    const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 950;
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.22;
    const lg = ctx.createGain(); lg.gain.value = 380;
    lfo.connect(lg); lg.connect(so.frequency);
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 2200;
    const sgain = ctx.createGain(); sgain.gain.value = 0;
    const span = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    so.connect(sl); sl.connect(sgain);
    if (span) { sgain.connect(span); span.connect(E.sfxBus); } else sgain.connect(E.sfxBus);
    so.start(); lfo.start();
    siren = { g: sgain, lfo, lg, pan: span, mode: 'wail', t: 0 };
    // helicopter: lowpassed noise + low triangle, chopped by a blade-pass LFO
    const hn = E.loopNoise();
    const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 520;
    const ho = ctx.createOscillator(); ho.type = 'triangle'; ho.frequency.value = 46;
    const hog = ctx.createGain(); hog.gain.value = 0.6;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const blade = ctx.createOscillator(); blade.type = 'square'; blade.frequency.value = 11;
    const bladeDepth = ctx.createGain(); bladeDepth.gain.value = 0.45;
    blade.connect(bladeDepth); bladeDepth.connect(chop.gain);
    hn.connect(hl); hl.connect(chop); ho.connect(hog); hog.connect(chop);
    const hg = ctx.createGain(); hg.gain.value = 0;
    const hpan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    chop.connect(hg);
    if (hpan) { hg.connect(hpan); hpan.connect(E.sfxBus); } else hg.connect(E.sfxBus);
    ho.start(); blade.start();
    heli = { g: hg, pan: hpan, lp: hl };
  };

  const setPan = (node, v) => node && E.set(node.pan, v, 0.05);

  // per frame. st = main.js state; G = game (may be partially missing)
  VS.update = (dt, st, G) => {
    const paused = st.paused;
    const pv = st.inCar && !paused ? G?.player?.vehicle : null;
    // player engine
    if (pv) {
      setProfile(player, pv.type);
      const damaged = pv.health / (pv.maxHealth || 100) < 0.25 ? 0.97 + Math.random() * 0.06 : 1;
      driveEngine(player, st.speed01, st.throttle, dt, 1, damaged);
    } else if (st.inCar && !paused) {
      setProfile(player, 'sedan');
      driveEngine(player, st.speed01, st.throttle, dt, 1);
    } else E.set(player.out.gain, 0, 0.12);

    // nearest other moving car within 40 m: positional engine with a touch of doppler
    let best = null, bd = 40;
    if (!paused && G?.vehicles) {
      for (const v of G.vehicles.list) {
        if (v === pv || v.dead || v.speed < 2 || (!v.driver && !v.ai)) continue;
        const d = Math.abs(v.x - E.listener.x) + Math.abs(v.z - E.listener.z);
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best) {
      setProfile(npc, best.type);
      const sp = E.spatial(best.x, best.z, 14);
      const dx = E.listener.x - best.x, dz = E.listener.z - best.z;
      const dl = Math.hypot(dx, dz) || 1;
      const vr = ((best.vx || 0) * dx + (best.vz || 0) * dz) / dl; // + approaching
      const dop = clamp(1 + vr / 120, 0.8, 1.25);
      driveEngine(npc, clamp(best.speed / best.def.maxSpeed, 0, 1), Math.abs(best.input?.throttle || 0.4), dt, sp.gain * (pv ? 0.45 : 0.8), dop);
      setPan(npc.pan, sp.pan);
    } else E.set(npc.out.gain, 0, 0.2);

    // tyre screech
    const sl = st.slide && !paused ? clamp(st.slideAmt, 0.15, 1) : 0;
    E.set(squeal.g.gain, sl * 0.09, 0.04);
    const wob = Math.random() * 120;
    E.set(squeal.b1.frequency, 1050 + sl * 350 + wob, 0.05);
    E.set(squeal.b2.frequency, 2150 + sl * 500 + wob * 2, 0.05);

    // siren: nearest police vehicle with siren on; alternate wail (6s) and yelp (3s)
    let sv = null, sd = 220;
    if (!paused && G?.vehicles) {
      for (const v of G.vehicles.list) {
        if (!v.siren || v.sirenOn === false || v.dead) continue;
        const d = Math.hypot(v.x - E.listener.x, v.z - E.listener.z);
        if (d < sd) { sd = d; sv = v; }
      }
    }
    siren.t += dt;
    if (siren.t > (siren.mode === 'wail' ? 6 : 3)) {
      siren.t = 0;
      siren.mode = siren.mode === 'wail' ? 'yelp' : 'wail';
      E.set(siren.lfo.frequency, siren.mode === 'wail' ? 0.22 : 3.6, 0.05);
      E.set(siren.lg.gain, siren.mode === 'wail' ? 380 : 300, 0.05);
    }
    if (sv) {
      const sp = E.spatial(sv.x, sv.z, 45);
      E.set(siren.g.gain, 0.05 * sp.gain * (sv === pv ? 0.6 : 1), 0.1);
      setPan(siren.pan, sv === pv ? 0 : sp.pan);
    } else E.set(siren.g.gain, 0, 0.2);

    // helicopter
    const h = !paused ? G?.police?.heli : null;
    if (h) {
      const sp = E.spatial(h.x, h.z, 40, h.y || 30);
      E.set(heli.g.gain, 0.32 * sp.gain, 0.1);
      E.set(heli.lp.frequency, 300 + 500 * sp.gain, 0.2);
      setPan(heli.pan, sp.pan);
    } else E.set(heli.g.gain, 0, 0.3);
  };

  return VS;
}
