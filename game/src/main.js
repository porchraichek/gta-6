// Entry point: builds the world, wires every system together and runs the main loop and game states.
import * as THREE from 'three';
import { DAY_SECONDS, START_TIME_HOURS } from './config.js';
import { createInput } from './input.js';
import { createEvents } from './events.js';
import { generateCity } from './citygen.js';
import { createCollision } from './collision.js';
import { createBuildingMaterials, buildBuildings } from './buildingsMesh.js';
import { buildTerrain } from './terrainMesh.js';
import { buildProps } from './propsMesh.js';
import { createEnvironment } from './environment.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { createActors } from './actors.js';
import { createVehicles } from './vehicles.js';
import { createCamera } from './camera.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createGangs } from './gangs.js';
import { createPickups } from './pickups.js';
import { createMarkers } from './markers.js';
import { createDialogue } from './dialogue.js';
import { createMissions } from './missions.js';
import { createRaces } from './races.js';
import { createPlaces } from './places.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createMenus } from './menus.js';
import { createSave } from './save.js';
import { createFlow } from './flow.js';
import { groundY, lightState } from './roadnet.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const G = { scene, renderer, params, time: 0, state: 'loading', paused: false, groundHeight: groundY, noWanted: false };
window.__game = G;
G.events = createEvents();
G.input = createInput(canvas);
G.city = generateCity();
G.collision = createCollision(G.city.colliders);

// ---- world meshes
const mats = createBuildingMaterials();
G.buildingMats = mats;
buildBuildings(scene, G.city, mats);
G.terrain = buildTerrain(scene, G.city);
G.propsMesh = buildProps(scene, G.city);

// ---- systems
G.camera3 = createCamera(G);
G.env = createEnvironment(scene, renderer, G.camera3.camera);
G.fx = createEffects(scene);
G.audio = createAudio();
G.music = createMusic(G.audio);
G.save = createSave(G);
G.actors = createActors(G);
G.vehicles = createVehicles(G);
G.combat = createCombat(G);
G.player = createPlayer(G);
G.wanted = createWanted(G);
G.police = createPolice(G);
G.traffic = createTraffic(G);
G.pedestrians = createPedestrians(G);
G.gangs = createGangs(G);
G.markers = createMarkers(G);
G.pickups = createPickups(G);
G.dialogue = createDialogue(G);
G.missions = createMissions(G);
G.races = createRaces(G);
G.places = createPlaces(G);
G.hud = createHud(G, ui);
G.minimap = createMinimap(G, G.hud.canvas);
G.menus = createMenus(G, ui);
G.flow = createFlow(G);
G.places.setup();

// ---- sizing and settings
function resize() {
  const q = G.settings?.quality ?? 'high';
  const dpr = Math.min(window.devicePixelRatio || 1, q === 'low' ? 0.75 : q === 'medium' ? 1 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  G.camera3.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera3.camera.updateProjectionMatrix();
}
G.applySettings = (s) => {
  G.settings = s;
  G.audio.setVolumes(s.sfx, s.music);
  G.camera3.sens = 0.0022 * s.sens;
  const q = s.quality;
  G.env.sun.castShadow = q !== 'low';
  const size = q === 'high' ? 2048 : 1024;
  if (G.env.sun.shadow.mapSize.x !== size) {
    G.env.sun.shadow.mapSize.set(size, size);
    G.env.sun.shadow.map?.dispose();
    G.env.sun.shadow.map = null;
  }
  resize();
};
window.addEventListener('resize', resize);
G.applySettings(G.save.settings());

// ---- game state helpers
G.pause = () => {
  if (G.state !== 'play') return;
  G.paused = true;
  G.state = 'paused';
  G.input.unlock();
  G.menus.showPause();
  G.music.setContext('menu');
};
G.resume = () => {
  G.paused = false;
  G.state = 'play';
  G.menus.hide();
  G.input.state.enabled = true;
  G.input.lock();
  G.audio.init();
};

function clearWorld() {
  const P = G.player;
  if (P.mode === 'car') { P.mode = 'foot'; P.actor.inVehicle = null; P.vehicle = null; }
  G.missions.abort?.();
  G.races.abort?.();
  for (const v of [...G.vehicles.list]) G.vehicles.remove(v);
  for (const a of [...G.actors.list]) if (a !== P.actor) G.actors.remove(a);
  for (const p of [...G.pickups.list]) G.pickups.remove(p);
  G.wanted.clear();
  G.dialogue.clear();
  G.hud.hideDeath();
  G.flow.mode = null;
}

G.startGame = (load) => {
  G.audio.init();
  clearWorld();
  const P = G.player;
  P.resetNew();
  G.pickups.collected = new Set();
  G.pickups.medallions = 0;
  G.races.wins = 0;
  G.races.best = null;
  const lm = G.city.landmarks.diner;
  let spot = { x: lm.x - 10, z: lm.z + 2, heading: 0 };
  let hour = START_TIME_HOURS;
  const data = load ? G.save.read() : null;
  if (data) {
    P.restore(data.player);
    G.missions.restore(data.missions);
    G.pickups.collected = new Set(data.medallions || []);
    G.pickups.medallions = G.pickups.collected.size;
    G.races.wins = data.race?.wins || 0;
    G.races.best = data.race?.best ?? null;
    hour = data.hour ?? hour;
    spot = { x: data.player.x, z: data.player.z, heading: data.player.heading };
  } else {
    G.missions.restore(null);
  }
  G.env.setHour(hour);
  P.teleport(spot.x, spot.z, spot.heading);
  G.camera3.yaw = spot.heading;
  G.camera3.pitch = -0.15;
  G.camera3.snap();
  G.pickups.placeSupplies();
  G.pickups.placeMedallions();
  G.races.setupMarker?.();
  if (!data) {
    // a car to borrow right at the start
    const v = G.vehicles.spawn('compact', lm.x + 12, lm.z + 18.3, Math.PI / 2, { color: 0xff6fb5 });
    v.parked = true;
    setTimeout(() => G.state === 'play' && !params.has('shot') && !G.missions.active && G.missions.startMarker && G.missions.start(G.missions.list[0]), 1800);
  }
  G.state = 'play';
  G.paused = false;
  G.menus.hide();
  G.hud.visible(true);
  G.input.state.enabled = true;
  G.input.lock();
  G.music.setContext('foot');
  G.hud.hint('WASD move · Mouse look · F enter car · M map');
};

G.toTitle = () => {
  clearWorld();
  G.paused = false;
  G.hud.visible(false);
  G.input.unlock();
  G.input.state.enabled = false;
  G.player.resetNew();
  const lm = G.city.landmarks.casino;
  G.player.teleport(lm.x - 60, lm.z + 80, 0);
  G.env.setHour(START_TIME_HOURS);
  G.menus.showTitle();
  G.music.setContext('menu');
};

G.input.state.onLockChange = (locked) => {
  if (!locked && G.state === 'play' && !params.has('shot')) G.pause();
};
window.addEventListener('blur', () => { if (G.state === 'play' && !params.has('shot')) G.pause(); });
window.addEventListener('keydown', (e) => { if (['F5', 'F9', 'Tab'].includes(e.code)) e.preventDefault(); });

// ---- per-frame
let signalT = 0, envT = 0, lastT = performance.now();
const titleCam = { a: 0.6 };

function updateTitle(dt) {
  titleCam.a += dt * 0.06;
  const c = G.camera3.camera;
  const cx = 150, cz = 40, r = 240;
  c.position.set(cx + Math.cos(titleCam.a) * r, 62 + Math.sin(titleCam.a * 0.7) * 10, cz + Math.sin(titleCam.a) * r);
  c.lookAt(cx, 25, cz);
  c.fov = 55; c.updateProjectionMatrix();
}

function simulate(dt) {
  const P = G.player;
  G.time += dt;
  G.input.state.enabled = G.state === 'play';
  if (G.state === 'play') {
    G.dialogue.update(dt);
    P.update(dt);
    G.onFrame?.(dt);
    G.missions.update(dt);
    G.races.update(dt);
    G.races.updateIdle();
    G.places.update(dt);
    G.flow.update(dt);
  }
  G.traffic.update(dt);
  G.pedestrians.update(dt);
  G.police.update(dt);
  G.gangs.update(dt);
  G.vehicles.update(dt);
  G.actors.collideVehicles(G.vehicles.list);
  G.actors.update(dt);
  G.pickups.update(dt);
  G.markers.update(dt);
  G.wanted.update(dt);
}

function lighting(dt) {
  envT -= dt;
  if (envT <= 0) {
    envT = 0.25;
    G.env.hour = (G.env.hour + (0.25 * 24) / DAY_SECONDS) % 24;
    G.env.setHour(G.env.hour);
    const n = G.env.night;
    G.buildingMats.facade.emissiveIntensity = n * 1.2;
    G.buildingMats.curtain.emissiveIntensity = n * 1.1;
    G.propsMesh.lampHeadMat.color.setRGB(0.4 + n * 2.0, 0.38 + n * 1.5, 0.3 + n * 0.5);
  }
  signalT -= dt;
  if (signalT <= 0) {
    signalT = 0.5;
    G.propsMesh.updateSignals((i, j, axis) => lightState(i, j, axis, G.time));
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  if (G.state === 'loading') return;
  const P = G.player;
  if (G.state === 'title') {
    simulate(dt);
    lighting(dt);
    updateTitle(dt);
  } else if (!G.paused) {
    G.input.state.enabled = G.state === 'play';
    simulate(dt);
    lighting(dt);
    if (G.state === 'play') {
      // keys: map, pause, quick save/load
      if (G.input.hit('KeyM') || G.input.hit('Tab')) G.menus.openMap();
      if (G.input.hit('KeyP')) G.pause();
      if (G.input.hit('F5')) G.save.manual('Quick save');
      if (G.input.hit('F9') && G.save.exists()) G.startGame(true);
    }
    G.camera3.update(dt);
    G.hud.update(dt);
    G.minimap.draw();
  } else {
    // paused: still allow closing the map / shop with keys, keep the picture alive
    if (G.state === 'map' && (G.input.hit('KeyM') || G.input.hit('Tab') || G.input.hit('Escape'))) G.resume();
    if (G.state === 'paused' && G.input.hit('KeyP')) G.resume();
    G.hud.update(0);
  }
  // audio each frame
  const cam = G.camera3.camera.position;
  G.audio.setListener(cam.x, cam.z, G.camera3.yaw);
  const v = P.mode === 'car' ? P.vehicle : null;
  G.audio.update(dt, {
    inCar: !!v && G.state === 'play', speed01: v ? Math.min(1, v.speed / v.def.maxSpeed) : 0, throttle: v ? Math.abs(v.input.throttle) : 0,
    slide: !!v?.sliding, slideAmt: v ? Math.min(1, Math.abs(v.lat) / 9) : 0, sirenDist: G.police.sirenDist ?? 1e9,
    nearSea: Math.abs(P.x) > 560 || Math.abs(P.z) > 560, paused: G.state === 'title' ? false : G.paused,
  });
  if (G.state === 'play') G.music.setContext(P.mode === 'car' ? 'car' : 'foot');
  G.env.update(dt, G.camera3.camera.position, { x: P.x, z: P.z });
  G.fx.update(dt, renderer.domElement.height / (2 * Math.tan((G.camera3.camera.fov * Math.PI) / 360)));
  renderer.render(scene, G.camera3.camera);
  G.input.endFrame();
}

G.step = (dt) => {
  simulate(dt);
  lighting(dt);
  G.camera3.update(dt);
  G.hud.update(dt);
};

// ---- boot
G.hud.visible(false);
G.state = 'title';
G.toTitle();
requestAnimationFrame(frame);
resize();
document.getElementById('loading').classList.add('done');
if (params.has('shot')) setupShot(G, params.get('shot'));
