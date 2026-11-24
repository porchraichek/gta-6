// Showcase scenes for screenshots: ?shot=chase | combat | night | beach | title sets up a staged moment and then flags readiness.
import { nodeX, nodeZ } from './roadnet.js';

const settle = (G, frames, dt = 1 / 30) => {
  for (let i = 0; i < frames; i++) G.step(dt);
};

function stubMission(G, title, text, extra = {}) {
  const def = G.missions.list.find((m) => m.title === title) || G.missions.list[0];
  G.missions.active = { G, def, steps: [{ update() {}, begin() {} }], stepIndex: 0, objective: { text, x: null, z: null }, timer: null, cleanup: [], enemies: [], t: 0, progress: null, ...extra };
  if (G.missions.startMarker) { G.markers.remove(G.missions.startMarker); G.missions.startMarker = null; }
}

function drive(G, v, speed) {
  v.vx = Math.sin(v.heading) * speed;
  v.vz = Math.cos(v.heading) * speed;
}

// Camera rigged to a moving car: ahead-left of it, looking back at the car and its pursuers.
function frontCam(G, car, ahead, side, height, lookBack) {
  G.camera3.cinematic = (dt, cam) => {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
    cam.position.set(car.x + fx * ahead + lx * side, height, car.z + fz * ahead + lz * side);
    cam.lookAt(car.x - fx * lookBack, 1.2, car.z - fz * lookBack);
    cam.fov = 58;
    cam.updateProjectionMatrix();
  };
}

export function setupShot(G, name) {
  const P = G.player;
  G.noWanted = false;
  P.godMode = true;
  if (name === 'title') {
    G.env.setHour(17.8);
    settle(G, 200);
    setTimeout(() => { window.__shotReady = true; }, 400);
    return;
  }
  G.startGame(false);
  G.dialogue.clear();
  G.hud.hint('');
  // clear the intro mission timer started by startGame
  if (G.missions.active) G.missions.abort();

  const finish = (frames = 30) => {
    settle(G, frames);
    G.hud.update(0.01);
    setTimeout(() => { window.__shotReady = true; }, 600);
  };

  if (name === 'models') {
    G.env.setHour(14);
    const lm = G.city.landmarks.diner;
    const types = ['compact', 'sedan', 'sports', 'pickup', 'van', 'cruiser', 'swat'];
    types.forEach((t, k) => {
      const v = G.vehicles.spawn(t, lm.x + 2 + k * 6.5, lm.z + 8, 0.5, { color: [0xe63946, 0x3a86ff, 0xffd166, 0x2a9d8f, 0xf1faee, 0x1b2d52, 0x1c2026][k], mission: true });
      v.parked = true;
    });
    P.teleport(lm.x + 20, lm.z + 24, Math.PI);
    G.camera3.cinematic = (dt, cam) => {
      cam.position.set(lm.x + 22, 4.2, lm.z + 26);
      cam.lookAt(lm.x + 22, 1.2, lm.z + 8);
      cam.fov = 55;
      cam.updateProjectionMatrix();
    };
    finish(10);
    return;
  }

  if (name === 'chase') {
    G.env.setHour(17.75);
    P.addMoney(2650);
    const z = nodeZ(5) + 4.5;
    const x0 = nodeX(4) + 20;
    G.traffic.update(0);
    const car = G.vehicles.spawn('sports', x0, z, Math.PI / 2, { color: 0xe63946 });
    P.teleport(x0 - 4, z, Math.PI / 2);
    P.enterVehicle(car);
    P.control = false;
    car.mission = true;
    G.camera3.yaw = Math.PI / 2;
    G.camera3.pitch = -0.2;
    G.camera3.snap();
    settle(G, 340); // let traffic and pedestrians populate around the frozen car
    P.giveWeapon('pistol', 60);
    stubMission(G, 'Clean Getaway', 'Lose the police: break line of sight');
    G.wanted.setStars(3);
    G.wanted.unseen = 0;
    // police cruisers closing in from behind
    const specs = [[-21, 0], [-36, -4.2], [-52, 3.8]];
    for (const [dx, dz] of specs) G.police.spawnCruiser('cruiser', car.x + dx, z + (dz ? dz : 0) * 0, Math.PI / 2);
    for (const v of G.vehicles.list) if (v.ai?.type === 'police') { drive(G, v, 34); }
    // remove any traffic directly in the way
    for (const v of [...G.vehicles.list]) if (v !== car && v.ai?.type !== 'police' && Math.abs(v.z - z) < 6 && v.x > car.x - 70 && v.x < car.x + 25) G.vehicles.remove(v);
    G.onFrame = () => {
      car.input.throttle = 1; car.input.steer = 0; car.input.handbrake = false;
      car.health = car.maxHealth;
    };
    drive(G, car, 36);
    car.fwd = 36;
    frontCam(G, car, 11, 4.5, 2.3, 16);
    finish(26);
    return;
  }

  if (name === 'combat') {
    G.env.setHour(18.35);
    const lm = G.city.landmarks.casino;
    P.giveWeapon('pistol', 80);
    P.giveWeapon('smg', 150);
    P.selectWeapon('smg');
    P.teleport(lm.x - 4, lm.z + 52, Math.PI);
    G.camera3.yaw = Math.PI;
    G.camera3.pitch = -0.1;
    G.camera3.snap();
    settle(G, 200);
    stubMission(G, 'Hostile Takeover', "Take out Hale's crew (4 left)");
    const thugs = G.gangs.spawn(lm.x + 2, lm.z + 25, 5, { weapon: 'pistol', spread: 9, aggro: 90, health: 60 });
    for (const t of thugs) t.ai.awake = true;
    G.missions.active.enemies = thugs;
    G.wanted.setStars(2);
    G.wanted.unseen = 0;
    G.input.state.rmb = true;
    let tt = 0;
    G.onFrame = (dt) => {
      tt += dt;
      G.input.state.lmb = true;
      G.input.state.rmb = true;
      P.takeDamage = () => {};
      P.mag.smg = 30;
    };
    G.camera3.cinematic = (dt, cam) => {
      cam.position.set(P.x + 2.2, P.y + 2.3, P.z + 5.2);
      cam.lookAt(P.x - 1.5, P.y + 1.5, P.z - 22);
      cam.fov = 60;
      cam.updateProjectionMatrix();
    };
    finish(40);
    return;
  }

  if (name === 'night') {
    G.env.setHour(21.2);
    P.addMoney(1450);
    const z = nodeZ(4) + 4.5;
    const x0 = nodeX(3) + 20;
    const car = G.vehicles.spawn('sports', x0, z, Math.PI / 2, { color: 0x3a86ff });
    P.teleport(x0 - 4, z, Math.PI / 2);
    P.enterVehicle(car);
    P.control = false;
    car.mission = true;
    G.camera3.yaw = Math.PI / 2;
    G.camera3.snap();
    settle(G, 340);
    G.wanted.setStars(2);
    stubMission(G, 'Rush Delivery', 'Deliver the van to Seagull Diner');
    for (const [dx] of [[-22], [-44]]) G.police.spawnCruiser('cruiser', car.x + dx, z - 4.5, Math.PI / 2);
    for (const v of G.vehicles.list) if (v.ai?.type === 'police') drive(G, v, 30);
    for (const v of [...G.vehicles.list]) if (v !== car && v.ai?.type !== 'police' && Math.abs(v.z - z) < 9 && v.x > car.x - 80 && v.x < car.x + 25) G.vehicles.remove(v);
    G.onFrame = () => { car.input.throttle = 0.9; car.input.steer = 0; };
    drive(G, car, 30);
    car.fwd = 30;
    frontCam(G, car, 10, -4.2, 2.0, 14);
    finish(24);
    return;
  }

  if (name === 'beach') {
    G.env.setHour(15.2);
    P.addMoney(980);
    const lm = G.city.landmarks.diner;
    P.teleport(lm.x - 4, lm.z + 3, 0.6);
    G.camera3.yaw = 0.9;
    G.camera3.pitch = -0.12;
    G.camera3.snap();
    P.selectWeapon('fists');
    settle(G, 360);
    // park a flashy car and walk near it
    const v = G.vehicles.spawn('sports', lm.x + 10, lm.z + 14.5, Math.PI / 2, { color: 0xffd166 });
    v.parked = true;
    G.vehicles.spawn('pickup', lm.x + 2, lm.z + 14.8, Math.PI / 2, { color: 0x06d6a0 }).parked = true;
    P.actor.faceHeading = null;
    G.onFrame = () => { G.input.state.mouseDX = 0; };
    stubMission(G, 'Chase the Rat', "Wreck Sal's purple Marlin before he gets away");
    // face the sea & traffic
    G.camera3.yaw = 1.0;
    finish(30);
    return;
  }
  finish(10);
}
