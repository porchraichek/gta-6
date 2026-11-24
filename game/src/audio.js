// Sound effects with WebAudio: synthesized engine, tyres, guns, explosions, sirens, ambience and UI blips.
import { clamp } from './random.js';

export function createAudio() {
  const A = { ctx: null, ready: false, sfxVol: 0.8, musicVol: 0.6, listener: { x: 0, z: 0, yaw: 0 } };
  let master, sfxBus, musicBus, noiseBuf;
  let engine = null, squeal = null, siren = null, ambience = null;

  A.init = () => {
    if (A.ready) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (A.ctx = new Ctx());
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = A.sfxVol;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = A.musicVol * 0.5;
    musicBus.connect(master);
    A.musicBus = musicBus;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.ready = true;
    buildEngine();
    buildSiren();
    buildAmbience();
  };

  A.setVolumes = (sfx, music) => {
    A.sfxVol = sfx;
    A.musicVol = music;
    if (!A.ready) return;
    sfxBus.gain.value = sfx;
    musicBus.gain.value = music * 0.5;
  };

  A.setListener = (x, z, yaw) => {
    A.listener.x = x; A.listener.z = z; A.listener.yaw = yaw;
  };

  // spatialise: returns {gain, pan} for a world point
  function spatial(x, z, ref = 30) {
    if (x === undefined) return { gain: 1, pan: 0 };
    const dx = x - A.listener.x, dz = z - A.listener.z;
    const d = Math.hypot(dx, dz);
    const rx = -Math.cos(A.listener.yaw), rz = Math.sin(A.listener.yaw);
    const pan = clamp((dx * rx + dz * rz) / (d + 8), -1, 1);
    return { gain: 1 / (1 + (d / ref) ** 1.6), pan };
  }

  function out(gainNode, x, z, ref) {
    const sp = spatial(x, z, ref);
    const g = A.ctx.createGain();
    g.gain.value = sp.gain;
    const p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
    gainNode.connect(g);
    if (p) { p.pan.value = sp.pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
  }

  function noise(dur, { type = 'lowpass', f0 = 2000, f1 = 200, gain = 0.5, attack = 0.002, x, z, ref, q = 0.7 } = {}) {
    if (!A.ready) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    out(g, x, z, ref);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, { type = 'sine', gain = 0.3, f1, x, z, ref, attack = 0.005 } = {}) {
    if (!A.ready) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    out(g, x, z, ref);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  A.gunshot = (weapon, x, z) => {
    if (weapon === 'shotgun') {
      noise(0.45, { f0: 3000, f1: 150, gain: 0.9, x, z, ref: 60 });
      tone(90, 0.3, { type: 'sine', f1: 40, gain: 0.8, x, z, ref: 60 });
    } else if (weapon === 'smg') {
      noise(0.14, { f0: 5000, f1: 700, gain: 0.55, x, z, ref: 50 });
      tone(180, 0.09, { type: 'square', f1: 70, gain: 0.25, x, z, ref: 50 });
    } else {
      noise(0.2, { f0: 4500, f1: 500, gain: 0.6, x, z, ref: 50 });
      tone(140, 0.14, { type: 'triangle', f1: 55, gain: 0.45, x, z, ref: 50 });
    }
  };
  A.explosion = (x, z) => {
    noise(1.8, { f0: 1800, f1: 60, gain: 1.0, x, z, ref: 120, attack: 0.01 });
    tone(70, 1.2, { type: 'sine', f1: 28, gain: 1.0, x, z, ref: 120 });
    tone(45, 1.4, { type: 'sawtooth', f1: 25, gain: 0.35, x, z, ref: 120 });
  };
  A.crash = (k, x, z) => {
    noise(0.35 + k * 0.3, { f0: 2500, f1: 200, gain: 0.35 + k * 0.5, x, z, ref: 50 });
    tone(110, 0.2, { type: 'square', f1: 50, gain: 0.2 * k, x, z, ref: 50 });
  };
  A.thud = (x, z, k = 0.6) => {
    noise(0.12, { f0: 700, f1: 120, gain: 0.5 * k, x, z, ref: 25 });
    tone(90, 0.12, { type: 'sine', f1: 50, gain: 0.4 * k, x, z, ref: 25 });
  };
  A.swing = () => noise(0.12, { type: 'bandpass', f0: 600, f1: 1800, gain: 0.18, q: 1.2 });
  A.hurt = () => tone(220, 0.18, { type: 'sawtooth', f1: 130, gain: 0.18 });
  A.ricochet = (x, z) => tone(1800, 0.12, { type: 'sine', f1: 700, gain: 0.12, x, z, ref: 40 });
  A.click = () => tone(1400, 0.04, { type: 'square', gain: 0.08 });
  A.reload = () => {
    tone(500, 0.05, { type: 'square', gain: 0.1 });
    setTimeout(() => A.ready && tone(300, 0.07, { type: 'square', gain: 0.1 }), 500);
    setTimeout(() => A.ready && tone(800, 0.05, { type: 'square', gain: 0.1 }), 950);
  };
  A.doorClose = () => {
    noise(0.1, { f0: 900, f1: 200, gain: 0.35 });
    tone(120, 0.1, { type: 'square', f1: 70, gain: 0.15 });
  };
  A.horn = (once) => {
    tone(420, once ? 0.35 : 0.2, { type: 'sawtooth', gain: 0.18 });
    tone(530, once ? 0.35 : 0.2, { type: 'sawtooth', gain: 0.14 });
  };
  A.pickup = () => {
    tone(880, 0.1, { type: 'triangle', gain: 0.2 });
    setTimeout(() => A.ready && tone(1320, 0.14, { type: 'triangle', gain: 0.2 }), 80);
  };
  A.cash = () => {
    tone(1200, 0.07, { type: 'square', gain: 0.1 });
    setTimeout(() => A.ready && tone(1800, 0.12, { type: 'square', gain: 0.1 }), 60);
  };
  A.wantedUp = () => {
    for (let i = 0; i < 3; i++) setTimeout(() => A.ready && tone(i % 2 ? 660 : 880, 0.13, { type: 'square', gain: 0.14 }), i * 140);
  };
  A.missionPass = () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.ready && tone(f, 0.35, { type: 'triangle', gain: 0.25 }), i * 160));
  };
  A.missionFail = () => {
    [392, 330, 262].forEach((f, i) => setTimeout(() => A.ready && tone(f, 0.4, { type: 'sawtooth', gain: 0.18 }), i * 220));
  };
  A.uiMove = () => tone(900, 0.03, { type: 'square', gain: 0.05 });
  A.uiSelect = () => {
    tone(600, 0.06, { type: 'square', gain: 0.1 });
    setTimeout(() => A.ready && tone(900, 0.08, { type: 'square', gain: 0.1 }), 50);
  };
  A.dialogue = () => tone(300 + Math.random() * 120, 0.05, { type: 'square', gain: 0.04 });

  // ---- continuous voices
  function buildEngine() {
    const ctx = A.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(sfxBus);
    o1.start(); o2.start();
    engine = { g, f, o1, o2 };
    // tyre squeal
    const sg = ctx.createGain(); sg.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 6;
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    ns.connect(sf); sf.connect(sg); sg.connect(sfxBus); ns.start();
    squeal = { g: sg, f: sf };
  }
  function buildSiren() {
    const ctx = A.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const lfo = ctx.createOscillator(); lfo.frequency.value = 1.6;
    const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(o.frequency);
    o.frequency.value = 780;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(sfxBus);
    o.start(); lfo.start();
    siren = { g, o };
  }
  function buildAmbience() {
    const ctx = A.ctx;
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.04;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    ns.connect(f); f.connect(g); g.connect(sfxBus);
    ns.start(); lfo.start();
    ambience = { g, f };
  }

  // called every frame
  A.update = (dt, state) => {
    if (!A.ready) return;
    const t = A.ctx.currentTime;
    if (state.inCar && !state.paused) {
      const sp = state.speed01;
      const f = 38 + sp * 120 + state.throttle * 18 + (state.gearWobble || 0);
      engine.o1.frequency.setTargetAtTime(f, t, 0.06);
      engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      engine.f.frequency.setTargetAtTime(380 + sp * 1300 + state.throttle * 300, t, 0.08);
      engine.g.gain.setTargetAtTime(0.1 + state.throttle * 0.07 + sp * 0.05, t, 0.1);
    } else engine.g.gain.setTargetAtTime(0, t, 0.1);
    squeal.g.gain.setTargetAtTime(state.slide ? clamp(state.slideAmt, 0.1, 1) * 0.08 : 0, t, 0.05);
    squeal.f.frequency.setTargetAtTime(1200 + state.slideAmt * 800, t, 0.1);
    // siren by closest police vehicle
    const sd = state.sirenDist;
    siren.g.gain.setTargetAtTime(sd < 200 && !state.paused ? 0.045 * (1 / (1 + (sd / 45) ** 1.5)) : 0, t, 0.1);
    ambience.g.gain.setTargetAtTime(state.paused ? 0 : 0.035 + (state.nearSea ? 0.04 : 0), t, 0.3);
    ambience.f.frequency.setTargetAtTime(state.nearSea ? 900 : 450, t, 0.5);
  };

  return A;
}
