// Headlight beam for the player's vehicle: a spotlight that fades in with the night.
import * as THREE from 'three';

export function createHeadlights(G) {
  const H = {};
  const spot = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.6, 1.2);
  const target = new THREE.Object3D();
  G.scene.add(spot, target);
  spot.target = target;

  H.update = () => {
    const P = G.player;
    const v = P.mode === 'car' ? P.vehicle : null;
    const n = G.env.night;
    if (!v || v.dead || n < 0.05) { spot.intensity = 0; return; }
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    spot.position.set(v.x + s * v.def.length * 0.45, 0.9, v.z + c * v.def.length * 0.45);
    target.position.set(v.x + s * 30, 0, v.z + c * 30);
    spot.intensity = 260 * n;
  };
  return H;
}
