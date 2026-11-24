// Third-person camera: over-the-shoulder on foot, speed-aware chase cam in vehicles, aim zoom, collision and shake.
import * as THREE from 'three';
import { clamp, damp, angleDiff } from './random.js';

export function createCamera(G) {
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.6, 2400);
  const C = {
    camera, yaw: 0, pitch: -0.12, dist: 5.5, fov: 62, mouseIdle: 5, snapNext: true, kickV: 0,
    sens: 0.0022, cinematic: null, lookBack: false, targetPos: new THREE.Vector3(),
  };
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  C.snap = () => {
    C.snapNext = true;
  };
  C.kick = (v) => {
    C.kickV += v;
  };

  C.aimRay = () => {
    camera.getWorldDirection(fwd);
    return { ox: camera.position.x, oy: camera.position.y, oz: camera.position.z, dx: fwd.x, dy: fwd.y, dz: fwd.z };
  };

  C.update = (dt) => {
    const P = G.player;
    const inp = G.input.state;
    if (C.cinematic) {
      C.cinematic(dt, camera);
      return;
    }
    // mouse look
    if (!G.paused && G.state === 'play') {
      if (inp.mouseDX || inp.mouseDY) C.mouseIdle = 0;
      C.yaw -= inp.mouseDX * C.sens;
      C.pitch = clamp(C.pitch - inp.mouseDY * C.sens, -1.1, 0.7);
      // arrow keys / look as backup
      const kx = G.input.axis('ArrowLeft', 'ArrowRight'), ky = G.input.axis('ArrowUp', 'ArrowDown');
      if (kx || ky) { C.yaw -= kx * dt * 2; C.pitch = clamp(C.pitch - ky * dt * 1.2, -1.1, 0.7); C.mouseIdle = 0; }
    }
    C.mouseIdle += dt;
    let tx, ty, tz, dist, height, side = 0, fovT = 62;
    if (P.mode === 'car') {
      const v = P.vehicle;
      tx = v.x; tz = v.z; ty = v.y + 1.0;
      C.lookBack = G.input.down('KeyC');
      const moving = v.speed > 2.5;
      if (C.mouseIdle > 1.1 || C.lookBack) {
        const target = v.heading + (C.lookBack ? Math.PI : 0);
        const k = (C.lookBack ? 9 : 2.4 + Math.min(v.speed, 30) * 0.08) * (moving || C.lookBack ? 1 : 0.2);
        C.yaw += angleDiff(C.yaw, target) * (1 - Math.exp(-k * dt));
        C.pitch = damp(C.pitch, -0.2, 2.5, dt);
      }
      dist = v.def.length * 0.5 + 5.3 + v.speed * 0.05;
      height = 1.2 + v.def.height * 0.5;
      fovT = 62 + clamp(v.speed / v.def.maxSpeed, 0, 1.2) * 18;
    } else {
      const a = P.actor;
      tx = a.x; tz = a.z; ty = a.y + 1.55;
      if (P.aiming) {
        dist = 2.7; height = 0.1; side = -0.75; fovT = 52;
        C.mouseIdle = 0;
      } else {
        dist = P.sprinting ? 6.2 : 5.4; height = 0.35; side = -0.35; fovT = P.sprinting ? 68 : 62;
      }
      // when running with no mouse movement, drift behind the player slowly
      if (!P.aiming && P.actor.speed > 3 && C.mouseIdle > 1.4) {
        const h = Math.atan2(a.vx, a.vz);
        C.yaw += angleDiff(C.yaw, h) * (1 - Math.exp(-0.6 * dt));
      }
    }
    C.fov = damp(C.fov, fovT, 5, dt);
    camera.fov = C.fov;
    camera.updateProjectionMatrix();

    const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
    // camera sits behind the look direction
    const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
    const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
    let dx = -fx * cp * dist + rx * side, dz = -fz * cp * dist + rz * side;
    let dy = -sp * dist + height + 0.8;
    if (P.mode === 'car') dy = clamp(dy, 1.2, 14);
    // collision: pull the camera in if a wall is in the way
    const len = Math.hypot(dx, dy, dz);
    const hit = G.collision.rayDistance(tx, ty, tz, dx / len, dy / len, dz / len, len);
    let k = 1;
    if (hit < len) k = clamp((hit - 0.8) / len, 0.12, 1);
    const wantX = tx + dx * k, wantY = Math.max(0.6, ty + dy * k), wantZ = tz + dz * k;
    if (C.snapNext) {
      pos.set(wantX, wantY, wantZ);
      C.snapNext = false;
    } else {
      const s = P.mode === 'car' ? 7 : 16;
      pos.x = damp(pos.x, wantX, s, dt);
      pos.y = damp(pos.y, wantY, s, dt);
      pos.z = damp(pos.z, wantZ, s, dt);
    }
    camera.position.copy(pos);
    C.kickV *= Math.exp(-8 * dt);
    const sh = G.fx.shake * G.fx.shake;
    camera.position.x += (Math.random() - 0.5) * sh * 0.8;
    camera.position.y += (Math.random() - 0.5) * sh * 0.8;
    camera.position.z += (Math.random() - 0.5) * sh * 0.8;
    // look target ahead of the player along the view direction
    look.set(tx + fx * cp * 14 + rx * side * 0.6, ty + sp * 14 + 0.2 + C.kickV * 6, tz + fz * cp * 14 + rz * side * 0.6);
    camera.lookAt(look);
    C.targetPos.set(tx, ty, tz);
  };

  return C;
}
