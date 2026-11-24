// WebAudio core: context, buses (sfx / music / ambience), master compressor, shared noise, a short
// generated reverb, listener-relative distance + stereo panning, and a voice limiter for one-shots.
import { clamp } from './random.js';

const MAX_VOICES = 56; // one-shot sources alive at once; quieter sounds are dropped first past this

export function createAudioEngine() {
  const E = {
    ctx: null, ready: false, sfxVol: 0.8, musicVol: 0.6,
    listener: { x: 0, z: 0, yaw: 0 },
    master: null, sfxBus: null, musicBus: null, ambBus: null, reverbIn: null, noiseBuf: null,
    voices: 0,
  };

  // true only when sounds scheduled now will actually be heard now (avoids bursts on resume)
  E.live = () => E.ready && E.ctx.state === 'running';

  E.init = () => {
    if (E.ready) {
      if (E.ctx.state === 'suspended') E.ctx.resume().catch(() => {});
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      const ctx = (E.ctx = new Ctx());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.22;
      E.master = ctx.createGain();
      E.master.gain.value = 0.9;
      E.master.connect(comp);
      comp.connect(ctx.destination);
      E.sfxBus = gainTo(E.master, E.sfxVol);
      E.musicBus = gainTo(E.master, E.musicVol * 0.5);
      E.noiseBuf = makeNoise(ctx, 2);
      buildReverb(ctx);
      E.ready = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    } catch (err) {
      console.warn('audio disabled:', err);
      E.ready = false;
      return false;
    }
  };

  function gainTo(dest, value) {
    const g = E.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }
  E.gainTo = gainTo;

  function makeNoise(ctx, seconds) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // a cheap "city street" reverb: stereo exponentially decaying noise, convolved once on a shared send bus
  function buildReverb(ctx) {
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.55 - t * 0.4); // darker as it decays
        d[i] = lp * Math.pow(1 - t, 2.6) * (i < 300 ? i / 300 : 1);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    E.reverbIn = ctx.createGain();
    E.reverbIn.gain.value = 0.55;
    E.reverbIn.connect(conv);
    conv.connect(E.sfxBus);
  }

  E.setVolumes = (sfx, music) => {
    E.sfxVol = sfx;
    E.musicVol = music;
    if (!E.ready) return;
    E.sfxBus.gain.setTargetAtTime(sfx, E.ctx.currentTime, 0.05);
    E.musicBus.gain.setTargetAtTime(music * 0.5, E.ctx.currentTime, 0.05);
  };

  E.setListener = (x, z, yaw) => {
    E.listener.x = x; E.listener.z = z; E.listener.yaw = yaw;
  };

  // distance gain, pan and raw distance for a world point; `ref` is the distance where gain is ~0.5
  E.spatial = (x, z, ref = 30, y = 0) => {
    if (x === undefined || x === null) return { gain: 1, pan: 0, dist: 0 };
    const dx = x - E.listener.x, dz = z - E.listener.z;
    const d = Math.hypot(dx, dz, y);
    const rx = -Math.cos(E.listener.yaw), rz = Math.sin(E.listener.yaw);
    const pan = clamp(((dx * rx + dz * rz) / (d + 6)) * 0.85, -0.85, 0.85);
    return { gain: 1 / (1 + (d / ref) ** 1.6), pan, dist: d };
  };

  // route a voice to a bus through distance gain + panner (+ optional reverb send); returns false if culled
  E.route = (node, sp, { bus = E.sfxBus, rev = 0 } = {}) => {
    const ctx = E.ctx;
    const g = ctx.createGain();
    g.gain.value = sp.gain;
    node.connect(g);
    if (sp.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      g.connect(p);
      p.connect(bus);
    } else g.connect(bus);
    if (rev > 0 && E.reverbIn) {
      const s = ctx.createGain();
      // far sounds are relatively more reverberant
      s.gain.value = rev * Math.min(1, sp.gain * 1.6 + 0.08);
      node.connect(s);
      s.connect(E.reverbIn);
    }
  };

  // voice limiter: decide whether a one-shot of this loudness may start
  E.admit = (gain) => {
    if (!E.live()) return false;
    if (gain < 0.004) return false;
    if (E.voices >= MAX_VOICES && gain < 0.5) return false;
    if (E.voices >= MAX_VOICES + 16) return false;
    return true;
  };
  function track(src) {
    E.voices++;
    src.onended = () => { E.voices--; };
  }

  // filtered noise burst. opts: type,f0,f1,q,gain,attack,at(delay s),x,z,ref,rev,bus,pan
  E.noise = (dur, o = {}) => {
    if (!E.ready) return;
    const sp = o.sp || E.spatial(o.x, o.z, o.ref);
    if (o.pan !== undefined) sp.pan = o.pan;
    const peak = o.gain ?? 0.5;
    if (!E.admit(sp.gain * peak)) return;
    const ctx = E.ctx, t = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = E.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.q ?? 0.7;
    const f0 = o.f0 ?? 2000;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? f0), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    E.route(g, sp, o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    track(src);
  };

  // oscillator blip with optional pitch glide. opts: type,f1,gain,attack,at,x,z,ref,rev,bus,pan,lp
  E.tone = (freq, dur, o = {}) => {
    if (!E.ready) return;
    const sp = o.sp || E.spatial(o.x, o.z, o.ref);
    if (o.pan !== undefined) sp.pan = o.pan;
    const peak = o.gain ?? 0.3;
    if (!E.admit(sp.gain * peak)) return;
    const ctx = E.ctx, t = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (o.attack ?? 0.005));
    if (o.hold) g.gain.setValueAtTime(peak, t + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      last = f;
    }
    last.connect(g);
    E.route(g, sp, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    track(osc);
  };

  // a looping noise source for continuous voices (engines, wind, rotor)
  E.loopNoise = () => {
    const s = E.ctx.createBufferSource();
    s.buffer = E.noiseBuf;
    s.loop = true;
    s.start(0, Math.random() * 1.5);
    return s;
  };

  // shared soft-clip curve for engines / guitars
  let clipCurve = null;
  E.softClip = () => {
    if (clipCurve) return clipCurve;
    const n = 1024;
    clipCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      clipCurve[i] = Math.tanh(x * 2.2);
    }
    return clipCurve;
  };

  // smoothly drive an AudioParam towards a value
  E.set = (param, value, tc = 0.08) => {
    if (E.ready) param.setTargetAtTime(value, E.ctx.currentTime, tc);
  };

  return E;
}
