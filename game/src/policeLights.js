// Emergency lightbar glow: additive red/blue sprites on every police vehicle with its lights on, plus one shared
// point light that follows the closest one at night and washes the street in alternating red and blue.
import * as THREE from 'three';

const LIGHT_RANGE = 70; // only a vehicle this close to the camera gets the real light

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createPoliceLights(G) {
  const tex = glowTexture();
  const mat = (color) => new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const redMat = mat(0xff2a2a), blueMat = mat(0x3a6bff);
  // kept in the scene permanently (intensity 0 by day) so adding it never forces shader recompiles
  const light = new THREE.PointLight(0xff2020, 0, 26, 2);
  G.scene.add(light);

  function attach(v) {
    const roofY = v.def.height + 0.2, z = v.type === 'swat' ? -0.5 : -0.35;
    const red = new THREE.Sprite(redMat), blue = new THREE.Sprite(blueMat);
    red.position.set(-0.32, roofY, z);
    blue.position.set(0.32, roofY, z);
    v.model.group.add(red, blue);
    v.glow = { red, blue, phase: Math.random() };
    return v.glow;
  }

  return {
    update() {
      const night = G.env.night;
      const size = 0.8 + night * 1.6;
      redMat.opacity = blueMat.opacity = 0.35 + night * 0.65;
      const cam = G.camera3.camera.position;
      let best = null, bd = LIGHT_RANGE;
      for (const v of G.vehicles.list) {
        if (!v.model.bar) continue;
        const on = v.siren && !v.dead && v.sirenOn !== false;
        if (!on && !v.glow) continue;
        const gl = v.glow || attach(v);
        // same phase as the lightbar meshes (vehicles.js flashes them at 7 Hz from G.time)
        const ph = Math.floor(G.time * 7) % 2 === 1;
        gl.red.visible = on && ph;
        gl.blue.visible = on && !ph;
        if (!on) continue;
        gl.red.scale.setScalar(size);
        gl.blue.scale.setScalar(size);
        const d = Math.hypot(v.x - cam.x, v.z - cam.z);
        if (d < bd) { bd = d; best = v; }
      }
      if (best && night > 0.05) {
        const ph = Math.floor(G.time * 7) % 2 === 1;
        light.color.setHex(ph ? 0xff2020 : 0x2850ff);
        light.position.set(best.x, best.def.height + 1.2, best.z);
        light.intensity = 40 * night;
      } else light.intensity = 0;
    },
  };
}
