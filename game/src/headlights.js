// Night vehicle lighting: a real spotlight for the player's vehicle plus cheap additive light pools on the road
// in front of (headlights) and behind (tail/brake lights) every nearby vehicle. Broken lamps dim their pools.
import * as THREE from 'three';
import { headlightsWorking } from './vehicleDamage.js';

const MAX_POOLS = 48;
const POOL_RANGE = 130; // metres from the camera

function gradientTexture(cx, cy, r) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function poolMesh(texture) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_POOLS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

export function createHeadlights(G) {
  const H = {};
  const spot = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.6, 1.2);
  const target = new THREE.Object3D();
  G.scene.add(spot, target);
  spot.target = target;

  const headPools = poolMesh(gradientTexture(32, 6, 62));
  const tailPools = poolMesh(gradientTexture(32, 32, 30));
  G.scene.add(headPools, tailPools);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  function updateSpot(n) {
    const P = G.player;
    const v = P.mode === 'car' ? P.vehicle : null;
    const working = v && !v.dead ? headlightsWorking(v) : 0;
    if (!working || n < 0.05) { spot.intensity = 0; return; }
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const bike = v.def.kind === 'bike';
    spot.angle = bike ? 0.42 : 0.55;
    spot.position.set(v.x + s * v.def.length * 0.45, v.y + (v.def.kind === 'boat' ? 1.2 : 0.9), v.z + c * v.def.length * 0.45);
    target.position.set(v.x + s * 30, v.y, v.z + c * 30);
    spot.intensity = 260 * n * working;
  }

  function updatePools(n) {
    let hc = 0, tc = 0;
    if (n > 0.08) {
      const cam = G.camera3.camera.position;
      for (const v of G.vehicles.list) {
        if (v.dead || v.def.kind === 'boat') continue;
        const dx = v.x - cam.x, dz = v.z - cam.z;
        if (dx * dx + dz * dz > POOL_RANGE * POOL_RANGE) continue;
        const s = Math.sin(v.heading), c = Math.cos(v.heading), hl = v.def.length / 2;
        q.setFromAxisAngle(up, v.heading);
        const working = headlightsWorking(v);
        if (working > 0 && hc < MAX_POOLS) {
          const w = v.def.kind === 'bike' ? 3.2 : v.def.width * 2.6, len = 13;
          p.set(v.x + s * (hl + len / 2 - 0.5), v.y + 0.09, v.z + c * (hl + len / 2 - 0.5));
          sc.set(w, 1, len);
          headPools.setMatrixAt(hc, m4.compose(p, q, sc));
          headPools.setColorAt(hc, col.setRGB(0.55, 0.5, 0.38).multiplyScalar(n * working));
          hc++;
        }
        if (tc < MAX_POOLS) {
          p.set(v.x - s * (hl + 0.9), v.y + 0.09, v.z - c * (hl + 0.9));
          sc.set(v.def.width * 1.5, 1, 2.6);
          tailPools.setMatrixAt(tc, m4.compose(p, q, sc));
          tailPools.setColorAt(tc, col.setRGB(0.6, 0.05, 0.04).multiplyScalar(n * (v.braking ? 1.6 : 0.6)));
          tc++;
        }
      }
    }
    headPools.count = hc;
    tailPools.count = tc;
    headPools.visible = hc > 0;
    tailPools.visible = tc > 0;
    if (hc) { headPools.instanceMatrix.needsUpdate = true; headPools.instanceColor.needsUpdate = true; }
    if (tc) { tailPools.instanceMatrix.needsUpdate = true; tailPools.instanceColor.needsUpdate = true; }
  }

  H.update = () => {
    const n = G.env.night;
    updateSpot(n);
    updatePools(n);
  };
  return H;
}
