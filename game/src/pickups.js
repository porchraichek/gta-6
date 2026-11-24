// Collectible pickups: dropped cash, health, armor, ammo, weapon crates and the hidden Sun Medallions.
import * as THREE from 'three';
import { GeoBuilder } from './geomkit.js';
import { rand } from './random.js';
import { blockCX, blockCZ } from './citygen.js';
import { BLOCK } from './config.js';
import { groundY } from './roadnet.js';

const SPECS = {
  cash: { color: 0x58e07a, make: (b) => b.box(0, 0, 0, 0.5, 0.14, 0.3, 0x58e07a) },
  health: { color: 0xff4d5e, make: (b) => { b.box(0, 0, 0, 0.5, 0.15, 0.14, 0xff4d5e); b.box(0, 0, 0, 0.14, 0.15, 0.5, 0xff4d5e); } },
  armor: { color: 0x5aa9ff, make: (b) => b.box(0, 0, 0, 0.5, 0.35, 0.2, 0x5aa9ff) },
  ammo: { color: 0xffc247, make: (b) => b.box(0, 0, 0, 0.5, 0.3, 0.3, 0xffc247) },
  medallion: { color: 0xffe066, make: (b) => b.cylinder(0, 0, 0, 0.4, 0.1, 0xffd23f, 'y', 14, 0xfff2a8) },
};

const MEDALLION_BLOCKS = [[0, 0], [11, 0], [0, 11], [11, 11], [5, 5], [10, 3], [3, 9], [8, 10], [1, 4], [6, 1], [9, 8], [4, 7], [2, 2], [11, 6]];

export function createPickups(G) {
  const K = { list: [], medallions: 0, medallionTotal: MEDALLION_BLOCKS.length, collected: new Set() };
  const geos = {};
  for (const [name, s] of Object.entries(SPECS)) {
    const b = new GeoBuilder();
    s.make(b);
    geos[name] = b.build();
  }
  const mats = {};
  for (const [name, s] of Object.entries(SPECS)) mats[name] = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  K.add = (type, x, z, value = 0, extra = {}) => {
    const mesh = new THREE.Mesh(geos[type], mats[type]);
    const y = (extra.y ?? groundY(x, z)) + 0.8;
    mesh.position.set(x, y, z);
    if (type === 'medallion') mesh.rotation.x = Math.PI / 2;
    G.scene.add(mesh);
    const p = { type, x, z, y, value, mesh, t: rand() * 6, ttl: extra.ttl ?? Infinity, id: extra.id, weapon: extra.weapon };
    K.list.push(p);
    return p;
  };
  K.remove = (p) => {
    G.scene.remove(p.mesh);
    const i = K.list.indexOf(p);
    if (i >= 0) K.list.splice(i, 1);
  };

  K.placeMedallions = () => {
    MEDALLION_BLOCKS.forEach(([i, j], idx) => {
      if (K.collected.has(idx)) return;
      const sx = idx % 2 ? 1 : -1, sz = idx % 3 ? 1 : -1;
      K.add('medallion', blockCX(i) + sx * (BLOCK / 2 - 3), blockCZ(j) + sz * (BLOCK / 2 - 3), 0, { id: idx });
    });
  };
  // fixed supplies near the hospital, shop and docks
  K.placeSupplies = () => {
    const L = G.city.landmarks;
    K.add('health', L.hospital.x + 6, L.hospital.z - 2, 50);
    K.add('armor', L.police.x - 8, L.police.z - 2, 50);
    K.add('ammo', L.arms.x + 8, L.arms.z - 2, 30);
    K.add('cash', L.casino.x + 8, L.casino.z, 150);
  };

  const apply = (p) => {
    const P = G.player;
    switch (p.type) {
      case 'cash': P.addMoney(p.value); G.audio?.cash(); break;
      case 'health': P.heal(p.value); G.audio?.pickup(); G.hud?.notify('+Health', 'good'); break;
      case 'armor': P.armor = Math.min(100, P.armor + p.value); G.audio?.pickup(); G.hud?.notify('+Armor', 'good'); break;
      case 'ammo': {
        const w = P.weapon !== 'fists' ? P.weapon : Object.keys(P.weapons).find((k) => k !== 'fists');
        if (w) { P.reserve[w] = (P.reserve[w] || 0) + p.value; G.hud?.notify(`+${p.value} ammo`, 'good'); }
        G.audio?.pickup();
        break;
      }
      case 'medallion':
        K.collected.add(p.id);
        K.medallions = K.collected.size;
        P.addMoney(250);
        G.audio?.pickup();
        G.hud?.notify(`Sun Medallion ${K.medallions}/${K.medallionTotal}  +$250`, 'good');
        if (K.medallions === K.medallionTotal) {
          P.addMoney(5000);
          G.hud?.notify('All Sun Medallions found! +$5,000', 'good');
        }
        break;
    }
  };

  K.update = (dt) => {
    const P = G.player;
    const reach = P.mode === 'car' ? 3.2 : 1.8;
    for (let i = K.list.length - 1; i >= 0; i--) {
      const p = K.list[i];
      p.t += dt;
      p.mesh.rotation.y = p.t * 2;
      if (p.type !== 'medallion') p.mesh.position.y = p.y + Math.sin(p.t * 3) * 0.12;
      p.ttl -= dt;
      if (p.ttl <= 0) { K.remove(p); continue; }
      if (Math.abs(p.x - P.x) < reach && Math.abs(p.z - P.z) < reach && !P.dead) {
        apply(p);
        if (p.type === 'health' || p.type === 'armor' || p.type === 'ammo') p.respawnAt = true;
        K.remove(p);
        if (p.respawnAt && !p.id) setTimeout(() => K.add(p.type, p.x, p.z, p.value), 60000);
      }
    }
  };

  // dead civilians and gang members drop cash
  G.events.on('actorKilled', (a) => {
    if (a.kind === 'ped' && rand() < 0.7) K.add('cash', a.x, a.z, Math.floor(8 + rand() * 60), { ttl: 40 });
    else if (a.team === 'gang') K.add(rand() < 0.5 ? 'cash' : 'ammo', a.x, a.z, rand() < 0.5 ? 80 : 18, { ttl: 60 });
    else if (a.kind === 'cop' && rand() < 0.5) K.add('ammo', a.x, a.z, 14, { ttl: 40 });
  });

  return K;
}
