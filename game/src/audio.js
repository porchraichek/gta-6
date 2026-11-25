// Sound effects facade (G.audio): wires the WebAudio engine, one-shot SFX library, vehicle voices and
// city ambience together, listens to game events for extra cues and drives footsteps each frame.
// Every call is safe before init() / without an AudioContext (it just does nothing).
import { createAudioEngine } from './audioEngine.js';
import { createSfx } from './sfxLibrary.js';
import { createVehicleSound } from './vehicleSound.js';
import { createAmbience } from './ambience.js';
import { clamp } from './random.js';

export function createAudio() {
  const E = createAudioEngine();
  const S = createSfx(E);
  const VS = createVehicleSound(E);
  const AM = createAmbience(E);
  const A = {
    get ctx() { return E.ctx; },
    get ready() { return E.ready; },
    get musicBus() { return E.musicBus; },
    get noiseBuf() { return E.noiseBuf; },
    get sfxVol() { return E.sfxVol; },
    get musicVol() { return E.musicVol; },
    listener: E.listener,
    combatT: -99, // ctx-independent clock (seconds) of the last gunfire / explosion, read by the music score
    clock: 0,
  };
  let built = false, stepPhase = 0;

  // guard every SFX so callers never throw, even if the context is missing or suspended
  const safe = (fn) => (...args) => {
    if (!E.ready) return;
    try { fn(...args); } catch (err) { console.warn('sfx', err); }
  };

  A.init = () => {
    if (!E.init()) return;
    if (built) return;
    built = true;
    try {
      VS.build();
      AM.build();
      listenToEvents();
    } catch (err) { console.warn('audio build failed', err); }
  };
  A.setVolumes = (sfx, music) => E.setVolumes(sfx, music);
  A.setListener = (x, z, yaw) => E.setListener(x, z, yaw);
  A.spatial = E.spatial;

  // ---- one-shots (old names kept; extra args are optional)
  const markCombat = () => { A.combatT = A.clock; };
  A.gunshot = safe((type, x, z, isPlayer) => { markCombat(); S.gunshot(type, x, z, isPlayer); });
  A.explosion = safe((x, z) => { markCombat(); S.explosion(x, z); });
  A.crash = safe(S.crash);
  A.thud = safe(S.thud);
  A.punch = safe(S.punch);
  A.swing = safe(S.swing);
  A.glass = safe(S.glass);
  A.metalHit = safe(S.metalHit);
  A.ricochet = safe(S.ricochet);
  A.footstep = safe(S.footstep);
  A.hurt = safe(S.hurt);
  A.reload = safe((type) => S.reload(type || window.__game?.player?.weapon));
  A.doorClose = safe(S.doorClose);
  A.doorOpen = safe(S.doorOpen);
  A.engineStart = safe(S.engineStart);
  A.horn = safe(S.horn);
  A.click = safe(S.click);
  A.uiMove = safe(S.uiMove);
  A.uiSelect = safe(S.uiSelect);
  A.uiBack = safe(S.uiBack);
  A.dialogue = safe(S.dialogue);
  A.pickup = safe(S.pickup);
  A.cash = safe(S.cash);
  A.wantedUp = safe(S.wantedUp);
  A.missionStart = safe(S.missionStart);
  A.missionPass = safe(S.missionPass);
  A.missionFail = safe(S.missionFail);
  A.busted = safe(S.busted);

  // extra cues taken straight from the event bus, so other systems need no changes
  function listenToEvents() {
    const ev = window.__game?.events;
    if (!ev) return;
    ev.on('missionStarted', () => A.missionStart());
    ev.on('bulletHitVehicle', (v) => v && A.metalHit(v.x, v.z));
    ev.on('playerBusted', () => A.busted());
    ev.on('enterVehicle', (v) => { if (v && !v.dead && (v.speed || 0) < 1) A.engineStart(); });
    ev.on('carjack', () => A.doorOpen());
  }

  function footsteps(dt, G, seaAmt) {
    const P = G?.player;
    const actor = P?.actor;
    if (!actor || P.mode !== 'foot' || P.dead || actor.speed < 0.8 || G.state !== 'play') return;
    const phase = Math.floor((actor.walkPhase || 0) / Math.PI);
    if (phase !== stepPhase) {
      stepPhase = phase;
      const surface = seaAmt > 0.35 ? 'sand' : 'road';
      A.footstep(surface, clamp(actor.speed / 7, 0.35, 1));
    }
  }

  // called every frame by main.js with { inCar, speed01, throttle, slide, slideAmt, sirenDist, nearSea, paused }
  A.update = (dt, state) => {
    A.clock += dt;
    if (!E.ready || !built) return;
    try {
      const G = window.__game;
      const edge = Math.max(Math.abs(E.listener.x), Math.abs(E.listener.z));
      const seaAmt = state.nearSea ? Math.max(0.6, clamp((edge - 470) / 120, 0, 1)) : clamp((edge - 470) / 120, 0, 1);
      VS.update(dt, state, G);
      let cars = 0;
      if (G?.vehicles) for (const v of G.vehicles.list) if (Math.abs(v.x - E.listener.x) + Math.abs(v.z - E.listener.z) < 150) cars++;
      AM.update(dt, { night: G?.env?.night ?? 0, seaAmt, inCar: state.inCar, paused: state.paused, cars });
      footsteps(dt, G, seaAmt);
    } catch (err) { console.warn('audio update', err); }
  };

  return A;
}
