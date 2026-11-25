// City ambience bed: distant traffic rumble, wind, sea waves near the shore, crickets at night,
// plus sparse one-shot birds (day), seagulls (day, near sea) and far-off horns. Muffled inside cars.
import { clamp } from './random.js';

export function createAmbience(E) {
  const AM = {};
  let bus, muffle, traffic, waves, crickets, wind;
  let birdT = 3, gullT = 6, hornT = 12;

  function noiseBed(type, freq, q = 0.7) {
    const ctx = E.ctx;
    const src = E.loopNoise();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(bus);
    return { f, g };
  }
  // slow LFO into a gain's AudioParam (adds a swell around its set value)
  function swell(param, rate, depth) {
    const lfo = E.ctx.createOscillator(); lfo.frequency.value = rate;
    const d = E.ctx.createGain(); d.gain.value = depth;
    lfo.connect(d); d.connect(param); lfo.start();
    return d;
  }

  AM.build = () => {
    const ctx = E.ctx;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 12000;
    muffle.connect(E.sfxBus);
    bus = ctx.createGain(); bus.gain.value = 1;
    bus.connect(muffle);
    traffic = noiseBed('lowpass', 260);
    traffic.depth = swell(traffic.g.gain, 0.07, 0);
    wind = noiseBed('bandpass', 500, 0.6);
    swell(wind.f.frequency, 0.05, 180);
    waves = noiseBed('lowpass', 800);
    waves.depth = swell(waves.g.gain, 0.085, 0);
    // crickets: 4.4kHz sine, chirped by a 28Hz square, grouped by a 1.6Hz pulse
    const c = ctx.createOscillator(); c.frequency.value = 4400;
    // each modulator swings its gain 0..1 (base 0.5 + 0.5 * lfo)
    const a1 = ctx.createGain(); a1.gain.value = 0.5;
    const m1 = ctx.createOscillator(); m1.type = 'square'; m1.frequency.value = 28;
    const d1 = ctx.createGain(); d1.gain.value = 0.5;
    m1.connect(d1); d1.connect(a1.gain);
    const a2 = ctx.createGain(); a2.gain.value = 0.5;
    const m2 = ctx.createOscillator(); m2.type = 'square'; m2.frequency.value = 1.6;
    const d2 = ctx.createGain(); d2.gain.value = 0.5;
    m2.connect(d2); d2.connect(a2.gain);
    const cg = ctx.createGain(); cg.gain.value = 0;
    c.connect(a1); a1.connect(a2); a2.connect(cg); cg.connect(bus);
    c.start(); m1.start(); m2.start();
    crickets = { g: cg };
  };

  function bird() {
    const pan = Math.random() * 1.6 - 0.8, g = 0.03 + Math.random() * 0.04;
    const base = 2600 + Math.random() * 2000;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const f = base * (0.9 + Math.random() * 0.25);
      E.tone(f, 0.07, { f1: f * (Math.random() < 0.5 ? 1.35 : 0.7), gain: g, at: i * (0.09 + Math.random() * 0.05), pan, bus });
    }
  }
  function gull() {
    const pan = Math.random() * 1.6 - 0.8;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 1300 + Math.random() * 300;
      E.tone(f, 0.32, { type: 'sawtooth', f1: f * 0.62, gain: 0.025, at: i * 0.38, pan, lp: 2200, bus });
    }
  }
  function distantHorn() {
    const pan = Math.random() * 1.6 - 0.8, f = 330 + Math.random() * 200;
    E.tone(f, 0.4, { type: 'sawtooth', gain: 0.02, pan, lp: 900, hold: 0.3, bus, rev: 0.4 });
    E.tone(f * 1.26, 0.4, { type: 'sawtooth', gain: 0.015, pan, lp: 900, hold: 0.3, bus });
  }

  // w: { night 0..1, seaAmt 0..1, inCar, paused, cars (nearby traffic count) }
  AM.update = (dt, w) => {
    const on = w.paused ? 0 : 1;
    const day = 1 - w.night;
    E.set(muffle.frequency, w.inCar ? 650 : 12000, 0.2);
    const city = (1 - w.seaAmt * 0.6) * (0.5 + clamp(w.cars / 12, 0, 1) * 0.5);
    E.set(traffic.g.gain, on * 0.05 * city * (0.7 + day * 0.3), 0.5);
    E.set(traffic.depth.gain, on * 0.015 * city, 0.5);
    E.set(wind.g.gain, on * (0.012 + w.seaAmt * 0.02), 0.5);
    E.set(waves.g.gain, on * 0.07 * w.seaAmt, 0.5);
    E.set(waves.depth.gain, on * 0.06 * w.seaAmt, 0.5);
    E.set(crickets.g.gain, on * 0.012 * clamp(w.night * 1.5 - 0.3, 0, 1) * (1 - w.seaAmt * 0.5), 0.8);
    if (w.paused || w.inCar) return;
    birdT -= dt; gullT -= dt; hornT -= dt;
    if (birdT <= 0) { birdT = 1.5 + Math.random() * 5; if (day > 0.5 && w.seaAmt < 0.7) bird(); }
    if (gullT <= 0) { gullT = 4 + Math.random() * 8; if (day > 0.4 && w.seaAmt > 0.3) gull(); }
    if (hornT <= 0) { hornT = 8 + Math.random() * 20; if (w.seaAmt < 0.5) distantHorn(); }
  };

  return AM;
}
