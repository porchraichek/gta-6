// Minimap and full-screen map: a pre-rendered city canvas, rotated to the player's heading, with blips for objectives, cops and enemies.
import { N, BLOCK, HALF, ISLAND, ROAD } from './config.js';
import { nodeX, nodeZ } from './roadnet.js';

const SCALE = 0.9; // map pixels per metre
const EXTENT = ISLAND + 60;

const DISTRICT_COLOR = { downtown: '#4a4a63', midtown: '#3c3f52', beach: '#5a5446', harbor: '#3b4350', hills: '#2f4a3a', park: '#2f6a3f' };
const ICONS = {
  mission: ['#ffd166', 'M'], obj: ['#ffd166', ''], car: ['#66e0ff', 'C'], enemy: ['#ff4d5e', ''], shop: ['#ff5d5d', 'G'], spray: ['#6ee7ff', 'P'],
  hospital: ['#ffffff', '+'], home: ['#7cf29a', 'H'], food: ['#ff8fa3', 'F'], race: ['#b388ff', 'R'],
};

export function createMinimap(G, canvas) {
  const S = {};
  const size = Math.ceil(EXTENT * 2 * SCALE);
  const base = document.createElement('canvas');
  base.width = base.height = size;
  const b = base.getContext('2d');

  function bake() {
    const toPx = (v) => (v + EXTENT) * SCALE;
    b.fillStyle = '#16405c';
    b.fillRect(0, 0, size, size);
    // island
    b.fillStyle = '#6f6650';
    b.fillRect(toPx(-ISLAND), toPx(-ISLAND), ISLAND * 2 * SCALE, ISLAND * 2 * SCALE);
    // roads
    b.fillStyle = '#85888f';
    for (let k = 0; k <= N; k++) {
      b.fillRect(toPx(nodeX(k) - ROAD / 2), toPx(-HALF - ROAD / 2), ROAD * SCALE, (HALF * 2 + ROAD) * SCALE);
      b.fillRect(toPx(-HALF - ROAD / 2), toPx(nodeZ(k) - ROAD / 2), (HALF * 2 + ROAD) * SCALE, ROAD * SCALE);
    }
    // blocks
    for (const bl of G.city.blocks) {
      b.fillStyle = DISTRICT_COLOR[bl.district];
      b.fillRect(toPx(bl.cx - BLOCK / 2), toPx(bl.cz - BLOCK / 2), BLOCK * SCALE, BLOCK * SCALE);
    }
    b.fillStyle = 'rgba(210,214,226,0.5)';
    for (const bd of G.city.buildings) b.fillRect(toPx(bd.x - bd.w / 2), toPx(bd.z - bd.d / 2), bd.w * SCALE, bd.d * SCALE);
    b.fillStyle = '#4bb6d8';
    for (const p of G.city.pools) if (p.round) { b.beginPath(); b.ellipse(toPx(p.x), toPx(p.z), p.w / 2 * SCALE, p.d / 2 * SCALE, 0, 0, 6.3); b.fill(); }
    S.toPx = toPx;
  }

  function drawBlip(ctx, x, y, icon, color, flash, r = 7) {
    const [c, letter] = ICONS[icon] || ['#fff', ''];
    ctx.save();
    if (flash && Math.floor(G.time * 3) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = color || c;
    ctx.strokeStyle = '#0b0b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (icon === 'car') ctx.rect(x - r, y - r * 0.7, r * 2, r * 1.4);
    else ctx.arc(x, y, r, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    if (letter) {
      ctx.fillStyle = '#0b0b12';
      ctx.font = `bold ${r * 1.3}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x, y + 1);
    }
    ctx.restore();
  }

  // Gather all blips as {x,z,icon,color,flash,r}
  function blips() {
    const out = [];
    for (const m of G.markers.list) if (m.blip) out.push({ x: m.x, z: m.z, icon: m.icon || 'obj', color: m.icon === 'enemy' ? '#ff4d5e' : undefined, r: m.icon === 'mission' ? 8 : 7, always: true });
    const info = G.missions?.objectiveInfo();
    if (info && info.x != null) out.push({ x: info.x, z: info.z, icon: 'obj', r: 8, always: true });
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle) continue;
      if (a.kind === 'cop') out.push({ x: a.x, z: a.z, icon: 'dot', color: Math.floor(G.time * 4) % 2 ? '#ff4d5e' : '#4d7bff', r: 4 });
      else if (a.kind === 'thug') out.push({ x: a.x, z: a.z, icon: 'dot', color: '#ff4d5e', r: 4 });
    }
    for (const v of G.vehicles.list) {
      if (v.kind === 'police' && !v.dead && v.siren && v.sirenOn !== false) out.push({ x: v.x, z: v.z, icon: 'dot', color: Math.floor(G.time * 4) % 2 ? '#ff4d5e' : '#4d7bff', r: 5 });
    }
    return out;
  }

  S.draw = () => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, R = w / 2;
    const P = G.player;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 3, 0, 6.3);
    ctx.clip();
    ctx.fillStyle = '#16405c';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(R, R);
    ctx.rotate(Math.PI + P.heading);
    const px = (P.x + EXTENT) * SCALE, pz = (P.z + EXTENT) * SCALE;
    ctx.drawImage(base, -px, -pz);
    ctx.restore();
    // blips in screen space
    const ang = Math.PI + P.heading, ca = Math.cos(ang), sa = Math.sin(ang);
    for (const bl of blips()) {
      const dx = (bl.x - P.x) * SCALE, dz = (bl.z - P.z) * SCALE;
      let sx = dx * ca - dz * sa, sy = dx * sa + dz * ca;
      const dist = Math.hypot(sx, sy);
      const edge = R - 12;
      if (dist > edge) {
        if (!bl.always) continue;
        sx = (sx / dist) * edge; sy = (sy / dist) * edge;
      }
      if (bl.icon === 'dot') {
        ctx.fillStyle = bl.color;
        ctx.beginPath(); ctx.arc(R + sx, R + sy, bl.r, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      } else drawBlip(ctx, R + sx, R + sy, bl.icon, bl.color, false, bl.r);
    }
    // player arrow
    ctx.save();
    ctx.translate(R, R);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0b0b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // wanted flashing ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = G.wanted.stars > 0 ? (Math.floor(G.time * 3) % 2 ? '#ff4d5e' : '#4d7bff') : 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(R, R, R - 3, 0, 6.3); ctx.stroke();
  };

  // Full-screen map (north-up)
  S.drawFull = (fc) => {
    const ctx = fc.getContext('2d');
    const w = fc.width, h = fc.height;
    ctx.fillStyle = '#0d2f45';
    ctx.fillRect(0, 0, w, h);
    const sc = Math.min(w, h) / (size) * 0.96;
    const ox = (w - size * sc) / 2, oy = (h - size * sc) / 2;
    ctx.drawImage(base, ox, oy, size * sc, size * sc);
    const tx = (x) => ox + (x + EXTENT) * SCALE * sc;
    const tz = (z) => oy + (z + EXTENT) * SCALE * sc;
    for (const bl of blips()) {
      if (bl.icon === 'dot') continue;
      drawBlip(ctx, tx(bl.x), tz(bl.z), bl.icon, bl.color, false, 9);
    }
    // labels
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    for (const m of G.markers.list) if (m.label) ctx.fillText(m.label, tx(m.x), tz(m.z) - 14);
    const P = G.player;
    ctx.save();
    ctx.translate(tx(P.x), tz(P.z));
    ctx.rotate(-P.heading + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // district names
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const names = { downtown: 'AURELIO HEIGHTS', beach: 'CORAL BEACH', harbor: 'PORT MARROW', hills: 'VERDE HILLS', midtown: 'COBALT ROW' };
    const cent = { downtown: [0, -30], beach: [HALF - 10, 0], harbor: [-100, HALF - 90], hills: [-HALF + 150, -HALF + 250], midtown: [-250, 170] };
    for (const [k, n] of Object.entries(names)) ctx.fillText(n, tx(cent[k][0]), tz(cent[k][1]));
  };

  bake();
  return S;
}
