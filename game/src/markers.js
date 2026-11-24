// World markers: glowing light pillars and ground rings for objectives, shops and activities (also feeds minimap blips).
import * as THREE from 'three';

export function createMarkers(G) {
  const M = { list: [] };
  const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);

  // opts: {x,z,color,radius,label,icon,pillar,height,blip,flash,id}
  M.add = (opts) => {
    const color = new THREE.Color(opts.color ?? 0xffd166);
    const group = new THREE.Group();
    const r = opts.radius ?? 3;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.scale.setScalar(r);
    ring.position.y = 0.25;
    group.add(ring);
    let pillar = null;
    if (opts.pillar !== false) {
      const h = opts.height ?? 60;
      pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
      pillar.scale.set(r * 0.9, h, r * 0.9);
      pillar.position.y = h / 2;
      group.add(pillar);
    }
    group.position.set(opts.x, opts.y ?? G.groundHeight?.(opts.x, opts.z) ?? 0, opts.z);
    G.scene.add(group);
    const m = { ...opts, group, ring, pillar, color: '#' + color.getHexString(), t: Math.random() * 6, removed: false };
    M.list.push(m);
    return m;
  };

  M.remove = (m) => {
    if (!m || m.removed) return;
    m.removed = true;
    G.scene.remove(m.group);
    m.ring.material.dispose();
    m.pillar?.material.dispose();
    const i = M.list.indexOf(m);
    if (i >= 0) M.list.splice(i, 1);
  };

  M.update = (dt) => {
    for (const m of M.list) {
      m.t += dt;
      const pulse = 1 + Math.sin(m.t * 3) * 0.06;
      m.ring.scale.setScalar((m.radius ?? 3) * pulse);
      m.ring.rotation.y += dt * 0.5;
      const d = Math.hypot(G.player.x - m.x, G.player.z - m.z);
      // pillars fade when the player stands close to avoid blocking the view
      if (m.pillar) m.pillar.material.opacity = 0.1 + 0.16 * Math.min(1, d / 25);
      m.group.visible = d < (m.far ?? 900);
    }
  };
  return M;
}
