// Third-person camera: over-the-shoulder on foot; in vehicles a chase cam with lag, look-ahead into turns,
// speed FOV and shake, mouse override that recentres, wall avoidance, plus far / hood / cinematic views (V to cycle).
import * as THREE from 'three';
import { clamp, damp, angleDiff, rand } from './random.js';

const VEHICLE_VIEWS = [
  { id: 'chase', label: 'Chase cam' },
  { id: 'far', label: 'Far chase cam' },
  { id: 'hood', label: 'Hood cam' },
  { id: 'cinematic', label: 'Cinematic cam' },
];
const RECENTER_DELAY = 1.0; // seconds of no mouse input before the chase cam swings back behind the car

export function createCamera(G) {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 2400);
  const C = {
    camera, yaw: 0, pitch: -0.12, dist: 5.5, fov: 62, mouseIdle: 5, snapNext: true, kickV: 0,
    sens: 0.0022, cinematic: null, lookBack: false, targetPos: new THREE.Vector3(),
    viewIndex: 0, turnLook: 0, accelPull: 0, colK: 1, shakeT: 0, cine: null,
  };
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  C.snap = () => { C.snapNext = true; };
  C.kick = (v) => { C.kickV += v; };
  C.view = () => VEHICLE_VIEWS[C.viewIndex].id;

  C.aimRay = () => {
    camera.getWorldDirection(fwd);
    return { ox: camera.position.x, oy: camera.position.y, oz: camera.position.z, dx: fwd.x, dy: fwd.y, dz: fwd.z };
  };

  function mouseLook(dt) {
    if (G.paused || G.state !== 'play') return;
    const inp = G.input.state;
    if (inp.mouseDX || inp.mouseDY) C.mouseIdle = 0;
    C.yaw -= inp.mouseDX * C.sens;
    C.pitch = clamp(C.pitch - inp.mouseDY * C.sens, -1.1, 0.7);
    const kx = G.input.axis('ArrowLeft', 'ArrowRight'), ky = G.input.axis('ArrowUp', 'ArrowDown');
    if (kx || ky) { C.yaw -= kx * dt * 2; C.pitch = clamp(C.pitch - ky * dt * 1.2, -1.1, 0.7); C.mouseIdle = 0; }
  }

  function setFov(target, dt, rate = 5) {
    C.fov = damp(C.fov, target, rate, dt);
    if (Math.abs(camera.fov - C.fov) > 0.01) {
      camera.fov = C.fov;
      camera.updateProjectionMatrix();
    }
  }

  // Orbit placement shared by on-foot and chase views: behind (tx,ty,tz) along yaw/pitch, pulled in by walls.
  function orbit(dt, tx, ty, tz, dist, height, side, carMode, stiffness) {
    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
    const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
    const dx = -fx * cp * dist + rx * side, dz = -fz * cp * dist + rz * side;
    let dy = -sp * dist + height + 0.8;
    if (carMode) dy = clamp(dy, 1.2, 14);
    // wall avoidance: snap in when blocked, ease back out once clear
    const len = Math.hypot(dx, dy, dz);
    const hit = G.collision.rayDistance(tx, ty, tz, dx / len, dy / len, dz / len, len + 0.6);
    const k = hit < len + 0.6 ? clamp((hit - 0.7) / len, 0.1, 1) : 1;
    C.colK = k < C.colK || C.snapNext ? k : damp(C.colK, k, 2.5, dt);
    const wantX = tx + dx * C.colK, wantY = Math.max(0.6, ty + dy * C.colK), wantZ = tz + dz * C.colK;
    if (C.snapNext) pos.set(wantX, wantY, wantZ);
    else {
      // inside walls the camera must not lag through geometry
      const s = C.colK < 0.98 ? Math.max(stiffness, 20) : stiffness;
      pos.set(damp(pos.x, wantX, s, dt), damp(pos.y, wantY, s, dt), damp(pos.z, wantZ, s, dt));
    }
    C.snapNext = false;
    return { fx, fz, rx, rz, cp, sp };
  }

  function applyShake(dt, extra) {
    C.kickV *= Math.exp(-8 * dt);
    const sh = G.fx.shake * G.fx.shake;
    camera.position.x += (Math.random() - 0.5) * sh * 0.8;
    camera.position.y += (Math.random() - 0.5) * sh * 0.8;
    camera.position.z += (Math.random() - 0.5) * sh * 0.8;
    if (extra > 0) {
      C.shakeT += dt;
      const t = C.shakeT;
      camera.position.x += (Math.sin(t * 41) + Math.sin(t * 23.7)) * extra * 0.5;
      camera.position.y += (Math.sin(t * 37.3) + Math.sin(t * 19.1)) * extra * 0.5;
    }
  }

  function updateFoot(dt) {
    const P = G.player, a = P.actor;
    const tx = a.x, ty = a.y + 1.55, tz = a.z;
    let dist, height, side, fovT;
    if (P.aiming) {
      dist = 2.7; height = 0.1; side = -0.75; fovT = 52;
      C.mouseIdle = 0;
    } else {
      dist = P.sprinting ? 6.2 : 5.4; height = 0.35; side = -0.35; fovT = P.sprinting ? 68 : 62;
    }
    // running with no mouse movement: drift behind the player slowly
    if (!P.aiming && a.speed > 3 && C.mouseIdle > 1.4) C.yaw += angleDiff(C.yaw, Math.atan2(a.vx, a.vz)) * (1 - Math.exp(-0.6 * dt));
    setFov(fovT, dt);
    const o = orbit(dt, tx, ty, tz, dist, height, side, false, 16);
    camera.position.copy(pos);
    applyShake(dt, 0);
    look.set(tx + o.fx * o.cp * 14 + o.rx * side * 0.6, ty + o.sp * 14 + 0.2 + C.kickV * 6, tz + o.fz * o.cp * 14 + o.rz * side * 0.6);
    camera.lookAt(look);
    C.targetPos.set(tx, ty, tz);
  }

  // Yaw the chase cam wants: the heading, swung towards the direction of travel during slides.
  function travelYaw(v) {
    if (v.speed > 4 && v.fwd > 2) return v.heading + angleDiff(v.heading, Math.atan2(v.vx, v.vz)) * 0.55;
    return v.heading;
  }

  function updateChase(dt, v, far) {
    const def = v.def;
    const sp01 = clamp(v.speed / def.maxSpeed, 0, 1.3);
    const tx = v.x, ty = v.y + (def.kind === 'boat' ? 1.3 : 1.0), tz = v.z;
    C.lookBack = G.input.down('KeyC');
    if (C.mouseIdle > RECENTER_DELAY || C.lookBack) {
      const target = travelYaw(v) + (C.lookBack ? Math.PI : 0);
      const moving = v.speed > 2.5;
      const k = C.lookBack ? 12 : (2.2 + Math.min(v.speed, 30) * 0.09) * (moving ? 1 : 0.25) * Math.min(1, (C.mouseIdle - RECENTER_DELAY) * 1.5 + 0.2);
      C.yaw += angleDiff(C.yaw, target) * (1 - Math.exp(-k * dt));
      C.pitch = damp(C.pitch, far ? -0.26 : -0.19, 2.5, dt);
    }
    // camera drops back under acceleration, tucks in under braking
    C.accelPull = damp(C.accelPull, clamp(-v.load * 2.2, -0.8, 1.4) + (v.boosting ? 1.2 : 0), 3, dt);
    const size = def.length * 0.5 + (def.kind === 'bike' ? 1.2 : 0);
    const dist = size + (far ? 8.6 : 5.0) + v.speed * 0.05 + C.accelPull;
    const height = (far ? 2.0 : 1.0) + def.height * 0.55;
    setFov(60 + Math.min(1, sp01) * 16 + (v.boosting ? 11 : 0), dt, v.boosting ? 3 : 5);
    const o = orbit(dt, tx, ty, tz, dist, height, 0, true, 7 + Math.min(v.speed, 40) * 0.08);
    camera.position.copy(pos);
    applyShake(dt, Math.max(0, sp01 - 0.72) * 0.16 + (v.boosting ? 0.035 : 0) + (v.burningOut ? 0.02 : 0));
    // look-ahead: aim a little into the turn
    C.turnLook = damp(C.turnLook, clamp(v.angVel * Math.min(v.speed, 25) * 0.12, -3.5, 3.5), 3, dt);
    const lx = -o.rx * C.turnLook, lz = -o.rz * C.turnLook;
    look.set(tx + o.fx * o.cp * 14 + lx, ty + o.sp * 14 + 0.2 + C.kickV * 6, tz + o.fz * o.cp * 14 + lz);
    camera.lookAt(look);
  }

  function updateHood(dt, v) {
    const def = v.def;
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const bike = def.kind === 'bike';
    const f = bike ? 0.1 : def.kind === 'boat' ? 0.2 : def.length * (v.type === 'bus' ? 0.4 : 0.1);
    const h = bike ? 1.55 : def.kind === 'boat' ? 1.7 : v.type === 'bus' ? 2.3 : def.height * 0.86 + 0.1;
    if (C.mouseIdle > RECENTER_DELAY) {
      C.yaw += angleDiff(C.yaw, v.heading) * (1 - Math.exp(-6 * dt));
      C.pitch = damp(C.pitch, -0.06, 4, dt);
    }
    pos.set(v.x + s * f, v.y + h, v.z + c * f);
    camera.position.copy(pos);
    applyShake(dt, Math.max(0, v.speed / def.maxSpeed - 0.72) * 0.05);
    const cp = Math.cos(C.pitch);
    look.set(pos.x + Math.sin(C.yaw) * cp * 10, pos.y + Math.sin(C.pitch) * 10, pos.z + Math.cos(C.yaw) * cp * 10);
    camera.lookAt(look);
    camera.rotateZ(-v.roll * (bike ? 0.8 : 0.4));
    setFov(70 + clamp(v.speed / def.maxSpeed, 0, 1) * 14 + (v.boosting ? 8 : 0), dt);
    C.snapNext = true; // switching back to chase starts clean
  }

  // Roadside camera: picks a spot ahead of the car and watches it pass, then cuts to a new spot.
  function pickCinematicSpot(v) {
    const dir = v.speed > 3 ? Math.atan2(v.vx, v.vz) : v.heading;
    const s = Math.sin(dir), c = Math.cos(dir);
    const ahead = clamp(10 + v.speed * 2.2, 12, 70);
    for (let tries = 0; tries < 6; tries++) {
      const side = (rand() < 0.5 ? -1 : 1) * (5 + rand() * 9);
      let x = v.x + s * ahead + c * side, z = v.z + c * ahead - s * side;
      const res = G.collision.pushCircle(x, z, 1);
      if (res.hit) { x = res.x; z = res.z; }
      const y = v.y + 0.9 + (rand() < 0.35 ? 4 + rand() * 6 : rand() * 2);
      if (G.collision.lineOfSight(x, y, z, v.x, v.y + 1, v.z)) return { x, y, z, t: 0 };
    }
    return { x: v.x - s * 12 + c * 4, y: v.y + 3, z: v.z - c * 12 - s * 4, t: 0 };
  }

  function updateCinematic(dt, v) {
    let cn = C.cine;
    if (cn) {
      cn.t += dt;
      cn.losT = (cn.losT ?? 0) - dt;
      const d = Math.hypot(cn.x - v.x, cn.z - v.z);
      let blocked = false;
      if (cn.losT <= 0) { cn.losT = 0.3; blocked = !G.collision.lineOfSight(cn.x, cn.y, cn.z, v.x, v.y + 1, v.z); }
      if (d > 75 || cn.t > 9 || blocked || (cn.t > 2.5 && d > 40)) cn = null;
    }
    if (!cn) {
      cn = C.cine = pickCinematicSpot(v);
      camera.position.set(cn.x, cn.y, cn.z);
    }
    camera.position.set(cn.x, cn.y, cn.z);
    applyShake(dt, 0);
    camera.lookAt(v.x, v.y + 0.9, v.z);
    const d = Math.hypot(cn.x - v.x, cn.y - v.y, cn.z - v.z);
    const want = clamp((2 * Math.atan(7 / Math.max(d, 1)) * 180) / Math.PI, 18, 66);
    setFov(want, dt, 3);
    C.snapNext = true;
  }

  C.update = (dt) => {
    const P = G.player;
    if (C.cinematic) {
      C.cinematic(dt, camera);
      return;
    }
    mouseLook(dt);
    C.mouseIdle += dt;
    if (P.mode !== 'car') {
      C.cine = null;
      updateFoot(dt);
      return;
    }
    const v = P.vehicle;
    if (G.state === 'play' && G.input.hit('KeyV')) {
      C.viewIndex = (C.viewIndex + 1) % VEHICLE_VIEWS.length;
      C.cine = null;
      C.snapNext = true;
      C.mouseIdle = 5;
      G.hud?.notify?.(`${VEHICLE_VIEWS[C.viewIndex].label}  [V]`, 'info');
    }
    const view = C.view();
    if (view === 'hood') updateHood(dt, v);
    else if (view === 'cinematic') updateCinematic(dt, v);
    else updateChase(dt, v, view === 'far');
    C.targetPos.set(v.x, v.y + 1, v.z);
  };

  return C;
}
