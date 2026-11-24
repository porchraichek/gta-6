// Procedural radio: three synthesized stations plus the menu theme, driven by a lookahead step sequencer.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const STATIONS = [
  {
    name: 'Sunset FM', bpm: 104, swing: 0,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [33, 29, 36, 31],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', arp: true, lead: [0, 4, 7, 4, 12, 7, 4, 0],
  },
  {
    name: 'Calle Caliente', bpm: 96, swing: 0.1,
    chords: [[50, 53, 57], [55, 58, 62], [57, 61, 64], [50, 53, 57]], bass: [38, 43, 45, 38],
    kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: '..x...x...x...x.', pluck: true, lead: [0, 3, 7, 3, 5, 3, 0, -2],
  },
  {
    name: 'Lowtide Radio', bpm: 82, swing: 0.15,
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36],
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', pad: true, lead: [0, 7, 4, 2, 0, 4, 7, 11],
  },
];

export function createMusic(audio) {
  const M = { station: -1, name: 'Radio Off', playing: false, menu: false, volume: 1 };
  let timer = null, step = 0, nextT = 0, gainNode = null, current = null;
  const level = { value: 0 };

  function ensure() {
    if (!audio.ready) return false;
    if (!gainNode) {
      gainNode = audio.ctx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(audio.musicBus);
    }
    return true;
  }

  function osc(freq, t, dur, type, gain, cutoff = 2400, attack = 0.01) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(gainNode);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noiseHit(t, dur, hp, gain) {
    const ctx = audio.ctx;
    const src = ctx.createBufferSource();
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(gainNode);
    src.start(t);
  }
  function kick(t, gain = 0.9) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(gainNode);
    o.start(t);
    o.stop(t + 0.25);
  }

  function scheduleStep(st, i, t) {
    const bar = Math.floor(i / 16) % 4;
    const s = i % 16;
    const chord = st.chords[bar];
    if (st.kick[s] === 'x') kick(t);
    if (st.snare[s] === 'x') { noiseHit(t, 0.16, 1500, 0.35); osc(190, t, 0.1, 'triangle', 0.25, 1200); }
    if (st.hat[s] === 'x') noiseHit(t, 0.05, 7000, 0.12);
    const dur = 60 / st.bpm / 4;
    if (st.arp) {
      // synthwave: rolling bass plus a bright arpeggio
      if (s % 2 === 0 || s % 4 === 3) osc(mtof(st.bass[bar]), t, dur * 1.7, 'sawtooth', 0.22, 700);
      osc(mtof(chord[s % chord.length] + (s % 8 > 3 ? 12 : 0) + 12), t, dur * 1.2, 'square', 0.07, 3000);
      if (s === 0) for (const n of chord) osc(mtof(n), t, dur * 14, 'sawtooth', 0.05, 900, 0.2);
    } else if (st.pluck) {
      if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) osc(mtof(st.bass[bar]), t, dur * 2, 'triangle', 0.4, 600);
      if ([0, 3, 6, 8, 11, 14].includes(s)) for (const n of chord) osc(mtof(n + 12), t, dur * 1.4, 'square', 0.05, 2200);
      if (s % 4 === 2) osc(mtof(chord[0] + 24 + st.lead[(i >> 1) % 8]), t, dur * 1.5, 'triangle', 0.08, 3000);
    } else if (st.pad) {
      if (s === 0 || s === 10) osc(mtof(st.bass[bar]), t, dur * 5, 'sine', 0.5, 500);
      if (s === 0) for (const n of chord) osc(mtof(n), t, dur * 15, 'triangle', 0.07, 1400, 0.4);
      if (s % 4 === 0) osc(mtof(chord[0] + 24 + st.lead[(i >> 2) % 8]), t, dur * 3, 'sine', 0.07, 2600, 0.02);
    }
  }

  function tick() {
    if (!M.playing || !audio.ready) return;
    const st = current;
    const ctx = audio.ctx;
    const stepDur = 60 / st.bpm / 4;
    while (nextT < ctx.currentTime + 0.35) {
      if (nextT < ctx.currentTime - 0.1) nextT = ctx.currentTime + 0.05;
      scheduleStep(st, step, nextT + (step % 2 ? st.swing * stepDur : 0));
      nextT += stepDur;
      step++;
    }
  }

  M.start = (index) => {
    if (!ensure()) return;
    M.stop(true);
    M.station = index;
    current = STATIONS[index];
    M.name = current.name;
    M.playing = true;
    step = 0;
    nextT = audio.ctx.currentTime + 0.1;
    timer = setInterval(tick, 60);
  };
  M.stop = (keepName) => {
    M.playing = false;
    clearInterval(timer);
    timer = null;
    if (!keepName) { M.name = 'Radio Off'; M.station = -1; }
  };
  M.next = () => {
    if (!ensure()) return;
    const n = M.station + 1;
    if (n >= STATIONS.length) { M.stop(); audio.click(); }
    else M.start(n);
  };
  // 'menu' | 'car' | 'foot' ; sets target loudness
  let lastCtx = null;
  M.setContext = (ctxName) => {
    if (!ensure() || ctxName === lastCtx) return;
    lastCtx = ctxName;
    if (ctxName === 'menu' && !M.playing) M.start(0);
    if (ctxName === 'car' && !M.playing && M.station === -1 && !M.userOff) M.start(0);
    const target = ctxName === 'menu' ? 0.8 : ctxName === 'car' ? 1 : 0.28;
    gainNode.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.4);
  };
  return M;
}
