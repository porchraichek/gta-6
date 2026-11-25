// Procedural instruments for the radio and score: drums, bass, pads, keys, plucks, bells, a crunchy
// guitar and a babbling "talk" voice. Each call schedules short-lived nodes at time t into `dest`.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createInstruments(audio) {
  const I = {};
  const ctx = () => audio.ctx;

  function env(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noiseSrc(t, dur) {
    const s = ctx().createBufferSource();
    s.buffer = audio.noiseBuf;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
    return s;
  }
  function filt(type, f, q = 0.7) {
    const b = ctx().createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  // ---- drums
  I.kick = (d, t, g = 0.9, pitch = 1, len = 0.24) => {
    const o = ctx().createOscillator();
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.13);
    const a = ctx().createGain();
    env(a, t, g, 0.002, len);
    o.connect(a); a.connect(d);
    o.start(t); o.stop(t + len + 0.02);
  };
  I.snare = (d, t, g = 0.35, body = 190, len = 0.16) => {
    const n = noiseSrc(t, len), f = filt('highpass', 1400), a = ctx().createGain();
    env(a, t, g, 0.001, len);
    n.connect(f); f.connect(a); a.connect(d);
    I.note(d, t, body, 0.08, { type: 'triangle', gain: g * 0.6, cut: 1500 });
  };
  I.clap = (d, t, g = 0.3) => {
    for (let i = 0; i < 3; i++) {
      const n = noiseSrc(t + i * 0.011, 0.12), f = filt('bandpass', 1300, 1.5), a = ctx().createGain();
      env(a, t + i * 0.011, g, 0.001, i === 2 ? 0.14 : 0.03);
      n.connect(f); f.connect(a); a.connect(d);
    }
  };
  I.hat = (d, t, g = 0.1, open = false) => {
    const len = open ? 0.22 : 0.045;
    const n = noiseSrc(t, len), f = filt('highpass', 7500), a = ctx().createGain();
    env(a, t, g, 0.001, len);
    n.connect(f); f.connect(a); a.connect(d);
  };
  I.rim = (d, t, g = 0.15) => I.note(d, t, 1700, 0.03, { type: 'square', gain: g, cut: 3500 });
  I.tom = (d, t, g = 0.5, f = 110) => {
    const o = ctx().createOscillator();
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const a = ctx().createGain();
    env(a, t, g, 0.002, 0.4);
    o.connect(a); a.connect(d);
    o.start(t); o.stop(t + 0.45);
  };
  I.crackle = (d, t, g = 0.05) => {
    const n = noiseSrc(t, 0.006), f = filt('highpass', 2500), a = ctx().createGain();
    env(a, t, g * (0.3 + Math.random()), 0.0005, 0.006);
    n.connect(f); f.connect(a); a.connect(d);
  };
  I.riser = (d, t, dur, g = 0.08) => {
    const n = noiseSrc(t, dur), f = filt('bandpass', 400, 2), a = ctx().createGain();
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(g, t + dur);
    a.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    n.connect(f); f.connect(a); a.connect(d);
  };

  // ---- pitched: generic filtered oscillator note. o: type, gain, cut, attack, q, sweep (filter env), glide, detune
  I.note = (d, t, freq, dur, o = {}) => {
    const osc = ctx().createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.glideFrom || freq, t);
    if (o.glideFrom) osc.frequency.exponentialRampToValueAtTime(freq, t + (o.glide || 0.08));
    if (o.detune) osc.detune.value = o.detune;
    const f = filt('lowpass', o.cut || 2400, o.q || 0.7);
    if (o.sweep) {
      f.frequency.setValueAtTime(o.sweep, t);
      f.frequency.exponentialRampToValueAtTime(o.cut || 600, t + Math.min(dur, 0.25));
    }
    const a = ctx().createGain();
    env(a, t, o.gain ?? 0.1, o.attack ?? 0.008, dur);
    osc.connect(f); f.connect(a); a.connect(d);
    osc.start(t); osc.stop(t + dur + 0.05);
  };
  I.pad = (d, t, freqs, dur, g = 0.04, cut = 1100) => {
    for (const fr of freqs) for (const det of [-9, 9]) I.note(d, t, fr, dur, { type: 'sawtooth', gain: g, cut, attack: Math.min(0.6, dur * 0.3), detune: det });
  };
  I.keys = (d, t, freq, dur, g = 0.08) => { // electric-piano-ish
    I.note(d, t, freq, dur, { type: 'sine', gain: g, attack: 0.005 });
    I.note(d, t, freq * 2, dur * 0.35, { type: 'sine', gain: g * 0.35, attack: 0.002 });
    I.note(d, t, freq * 4.01, 0.08, { type: 'sine', gain: g * 0.12, attack: 0.001 });
  };
  I.pluck = (d, t, freq, dur, g = 0.07) => I.note(d, t, freq, dur, { type: 'square', gain: g, cut: 500, sweep: 4200, attack: 0.002 });
  I.marimba = (d, t, freq, g = 0.09) => {
    I.note(d, t, freq, 0.35, { type: 'sine', gain: g, attack: 0.002 });
    I.note(d, t, freq * 3.98, 0.06, { type: 'sine', gain: g * 0.3, attack: 0.001 });
  };
  I.bell = (d, t, freq, dur, g = 0.06) => {
    I.note(d, t, freq, dur, { type: 'sine', gain: g, attack: 0.002 });
    I.note(d, t, freq * 2.76, dur * 0.5, { type: 'sine', gain: g * 0.4, attack: 0.002 });
    I.note(d, t, freq * 5.4, dur * 0.25, { type: 'sine', gain: g * 0.15, attack: 0.001 });
  };
  I.bass = (d, t, freq, dur, g = 0.22, type = 'sawtooth', cut = 650) => I.note(d, t, freq, dur, { type, gain: g, cut, sweep: cut * 2.2, q: 2 });
  I.sub = (d, t, freq, dur, g = 0.4, glideFrom) => I.note(d, t, freq, dur, { type: 'sine', gain: g, glideFrom, glide: 0.1, attack: 0.004 });
  I.slap = (d, t, freq, dur, g = 0.25) => {
    I.note(d, t, freq, dur, { type: 'sawtooth', gain: g, cut: 500, sweep: 3000, q: 4, attack: 0.002 });
    I.note(d, t, freq, 0.03, { type: 'square', gain: g * 0.4, cut: 4000 });
  };
  I.strings = (d, t, freq, dur, g = 0.05) => {
    for (const det of [-12, 0, 12]) I.note(d, t, freq, dur, { type: 'sawtooth', gain: g, cut: 1800, attack: 0.02, detune: det });
  };

  // ---- distorted guitar: per-destination shared waveshaper + cabinet filter
  const guitarBus = new WeakMap();
  function gtrBus(d) {
    let b = guitarBus.get(d);
    if (b) return b;
    const pre = ctx().createGain(); pre.gain.value = 3;
    const sh = ctx().createWaveShaper();
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 4); }
    sh.curve = c;
    const cab = filt('lowpass', 2800, 1);
    const hp = filt('highpass', 110);
    const out = ctx().createGain(); out.gain.value = 0.12;
    pre.connect(sh); sh.connect(hp); hp.connect(cab); cab.connect(out); out.connect(d);
    b = pre;
    guitarBus.set(d, b);
    return b;
  }
  I.guitar = (d, t, freqs, dur, g = 0.25) => {
    const bus = gtrBus(d);
    for (const f of freqs) for (const det of [-6, 6]) I.note(bus, t, f, dur, { type: 'sawtooth', gain: g, cut: 5000, attack: 0.003, detune: det });
  };
  I.scratch = (d, t, g = 0.15) => { // muted funk strum
    const n = noiseSrc(t, 0.04), f = filt('bandpass', 1800, 3), a = ctx().createGain();
    env(a, t, g, 0.001, 0.04);
    n.connect(f); f.connect(a); a.connect(d);
  };

  // ---- a talk-radio voice: one syllable of formant-filtered buzz (unintelligible on purpose)
  const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870]];
  I.syllable = (d, t, f0, dur, g = 0.1) => {
    const o = ctx().createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.3), t + dur);
    const [f1, f2] = VOWELS[(Math.random() * VOWELS.length) | 0];
    const a = ctx().createGain();
    env(a, t, g, 0.02, dur);
    for (const [ff, gg] of [[f1, 1], [f2, 0.5]]) {
      const b = filt('bandpass', ff, 6), bg = ctx().createGain();
      bg.gain.value = gg;
      o.connect(b); b.connect(bg); bg.connect(a);
    }
    a.connect(d);
    o.start(t); o.stop(t + dur + 0.05);
  };

  return I;
}
