// Minimap and full-screen map: a pre-baked city image, rotated with the player's view, with blips, GPS route, search area and waypoint.
import { N, BLOCK, HALF, ISLAND, ROAD, DISTRICTS } from './config.js';
import { nodeX, nodeZ } from './roadnet.js';
import { createGps } from './gpsRoute.js';
import { STREETS_NS, STREETS_EW } from './streetNames.js';

const BAKE = 1.6; // baked pixels per metre
const EXTENT = ISLAND + 80;
const ZOOM_NEAR = 0.95, ZOOM_FAR = 0.5; // minimap pixels per metre, slow vs fast
const ROUTE_COLOR = '#c86bff';
const WAYPOINT_COLOR = '#ff4fd8';

const DISTRICT_FILL = { downtown: '#3a3550', midtown: '#353a4c', beach: '#4a4150', harbor: '#353d48', hills: '#34453e', park: '#2f6b46' };
// icon -> [fill, glyph, legend label]
export const BLIP_STYLE = {
  mission: ['#ffd166', '!', 'Next job'], obj: ['#ffd166', '', 'Objective'], car: ['#66e0ff', '', 'Vehicle'], enemy: ['#ff4d5e', '', 'Target'],
  shop: ['#ff6b6b', '¤', 'Gun shop'], spray: ['#6ee7ff', '~', 'Respray'], hospital: ['#ffffff', '+', 'Hospital'], home: ['#7cf29a', '⌂', 'Safehouse'],
  food: ['#ff8fa3', '•', 'Food'], race: ['#b388ff', '⚑', 'Street race'], waypoint: [WAYPOINT_COLOR, '', 'Waypoint'],
};
const DISTRICT_LABELS = { downtown: [0, -30], beach: [HALF - 10, 0], harbor: [-100, HALF - 70], hills: [-HALF + 150, -HALF + 230], midtown: [-260, 170], park: [nodeX(2) + 45, nodeZ(8) + 45] };

export function createMinimap(G, canvas) {
  const S = { waypoint: null };
  const gps = createGps();
  const size = Math.ceil(EXTENT * 2 * BAKE);
  const base = document.createElement('canvas');
  base.width = base.height = size;
  const toPx = (v) => (v + EXTENT) * BAKE;
  let zoom = ZOOM_NEAR, waypointMarker = null;

  function bake() {
    const b = base.getContext('2d');
    // sea with a soft gradient towards the shore
    const g = b.createRadialGradient(size / 2, size / 2, ISLAND * BAKE * 0.9, size / 2, size / 2, size * 0.72);
    g.addColorStop(0, '#1d6f8f'); g.addColorStop(1, '#0f3a55');
    b.fillStyle = g;
    b.fillRect(0, 0, size, size);
    // sand ring and land
    b.fillStyle = '#d9c48f';
    roundRect(b, toPx(-ISLAND - 6), toPx(-ISLAND - 6), (ISLAND + 6) * 2 * BAKE, (ISLAND + 6) * 2 * BAKE, 40 * BAKE);
    b.fillStyle = '#c9b27c';
    roundRect(b, toPx(-ISLAND), toPx(-ISLAND), ISLAND * 2 * BAKE, ISLAND * 2 * BAKE, 34 * BAKE);
    b.fillStyle = '#2b2f3e';
    b.fillRect(toPx(-HALF - ROAD), toPx(-HALF - ROAD), (HALF + ROAD) * 2 * BAKE, (HALF + ROAD) * 2 * BAKE);
    // roads: light asphalt with a darker centre line
    b.fillStyle = '#d7dae4';
    for (let k = 0; k <= N; k++) {
      b.fillRect(toPx(nodeX(k) - ROAD / 2), toPx(-HALF - ROAD / 2), ROAD * BAKE, (HALF * 2 + ROAD) * BAKE);
      b.fillRect(toPx(-HALF - ROAD / 2), toPx(nodeZ(k) - ROAD / 2), (HALF * 2 + ROAD) * BAKE, ROAD * BAKE);
    }
    // blocks (sidewalk edge, then district fill)
    for (const bl of G.city.blocks) {
      b.fillStyle = '#9da1ae';
      b.fillRect(toPx(bl.cx - BLOCK / 2), toPx(bl.cz - BLOCK / 2), BLOCK * BAKE, BLOCK * BAKE);
      b.fillStyle = DISTRICT_FILL[bl.district] ?? '#353a4c';
      b.fillRect(toPx(bl.cx - BLOCK / 2 + 3), toPx(bl.cz - BLOCK / 2 + 3), (BLOCK - 6) * BAKE, (BLOCK - 6) * BAKE);
    }
    b.fillStyle = 'rgba(236,228,255,0.28)';
    for (const bd of G.city.buildings) b.fillRect(toPx(bd.x - bd.w / 2), toPx(bd.z - bd.d / 2), bd.w * BAKE, bd.d * BAKE);
    b.fillStyle = '#4fc6e8';
    for (const p of G.city.pools) {
      b.beginPath();
      if (p.round) b.ellipse(toPx(p.x), toPx(p.z), (p.w / 2) * BAKE, (p.d / 2) * BAKE, 0, 0, 6.3);
      else b.rect(toPx(p.x - p.w / 2), toPx(p.z - p.d / 2), p.w * BAKE, p.d * BAKE);
      b.fill();
    }
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fill(); }

  function drawGlyphBlip(ctx, x, y, icon, color, r = 7) {
    const [c, glyph] = BLIP_STYLE[icon] || ['#fff', ''];
    ctx.fillStyle = color || c;
    ctx.strokeStyle = '#0b0b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (icon === 'car') ctx.roundRect ? ctx.roundRect(x - r, y - r * 0.7, r * 2, r * 1.4, 3) : ctx.rect(x - r, y - r * 0.7, r * 2, r * 1.4);
    else if (icon === 'obj' || icon === 'waypoint') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    if (glyph) {
      ctx.fillStyle = '#0b0b12';
      ctx.font = `900 ${Math.round(r * 1.45)}px Bahnschrift, 'Arial Narrow', Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, y + 1);
    }
  }
  const copColor = () => (Math.floor(G.time * 4) % 2 ? '#ff3b4f' : '#3d7bff');

  // all blips as {x,z,icon,color,r,always,dot}
  function blips() {
    const out = [];
    for (const m of G.markers.list) if (m.blip) out.push({ x: m.x, z: m.z, icon: m.icon || 'obj', r: m.icon === 'mission' ? 8 : 7, always: true });
    const info = G.missions?.objectiveInfo?.();
    if (info && info.x != null) out.push({ x: info.x, z: info.z, icon: 'obj', r: 8, always: true });
    if (S.waypoint) out.push({ x: S.waypoint.x, z: S.waypoint.z, icon: 'waypoint', r: 8, always: true });
    for (const a of G.actors.list) {
      if (a.dead || a.inVehicle || a === G.player.actor) continue;
      if (a.kind === 'cop') out.push({ x: a.x, z: a.z, dot: true, color: copColor(), r: 4 });
      else if (a.kind === 'thug' || a.team === 'gang' && a.ai?.awake) out.push({ x: a.x, z: a.z, dot: true, color: '#ff4d5e', r: 4 });
    }
    for (const v of G.vehicles.list) {
      if (v.kind === 'police' && !v.dead && (v.siren || G.wanted?.stars > 0)) out.push({ x: v.x, z: v.z, dot: true, color: copColor(), r: 5.5, square: true });
    }
    return out;
  }

  // where the GPS should lead: player's waypoint, else the active objective
  function gpsTarget() {
    if (S.waypoint) return S.waypoint;
    const info = G.missions?.objectiveInfo?.();
    if (info && info.x != null) return { x: info.x, z: info.z };
    return null;
  }

  function strokeRoute(ctx, pts, map, width) {
    if (pts.length < 2) return;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const [sx, sy] = map(x, z); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.strokeStyle = 'rgba(10,6,20,0.75)'; ctx.lineWidth = width + 3; ctx.stroke();
    ctx.strokeStyle = S.waypoint ? WAYPOINT_COLOR : ROUTE_COLOR; ctx.lineWidth = width; ctx.stroke();
  }

  function searchArea() {
    const s = G.wanted?.search;
    return s?.active && s.radius > 0 ? s : null;
  }

  function updateWaypoint() {
    if (!S.waypoint) return;
    const P = G.player;
    if (Math.hypot(P.x - S.waypoint.x, P.z - S.waypoint.z) < 14) {
      S.setWaypoint(null);
      G.hud?.notify('Waypoint reached', 'good');
    }
  }

  S.setWaypoint = (p) => {
    if (waypointMarker) { G.markers.remove(waypointMarker); waypointMarker = null; }
    S.waypoint = p;
    if (p) waypointMarker = G.markers.add({ x: p.x, z: p.z, color: 0xff4fd8, radius: 3, pillar: true, height: 70, blip: false });
  };

  S.draw = () => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, R = w / 2;
    const P = G.player;
    updateWaypoint();
    const speed = P.mode === 'car' ? Math.abs(P.vehicle?.speed ?? 0) : 0;
    const want = ZOOM_NEAR + (ZOOM_FAR - ZOOM_NEAR) * Math.min(1, speed / 38);
    zoom += (want - zoom) * 0.05;
    const view = P.mode === 'car' || G.camera3?.cinematic ? P.heading : (G.camera3?.yaw ?? P.heading);
    const ang = Math.PI + view, ca = Math.cos(ang), sa = Math.sin(ang);
    const map = (x, z) => { const dx = (x - P.x) * zoom, dz = (z - P.z) * zoom; return [R + dx * ca - dz * sa, R + dx * sa + dz * ca]; };

    ctx.clearRect(0, 0, w, w);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, 6.3); ctx.clip();
    ctx.fillStyle = '#0f3a55';
    ctx.fillRect(0, 0, w, w);
    // base image in world-rotated space
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(ang);
    ctx.scale(zoom / BAKE, zoom / BAKE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, -toPx(P.x), -toPx(P.z));
    ctx.restore();
    // police search area
    const s = searchArea();
    if (s) {
      const [sx, sy] = map(s.x, s.z);
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 5);
      ctx.fillStyle = `rgba(255,60,90,${0.16 + pulse * 0.1})`;
      ctx.strokeStyle = copColor();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(sx, sy, s.radius * zoom, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    // GPS route
    const t = gpsTarget();
    if (t) strokeRoute(ctx, gps(P.x, P.z, t.x, t.z), map, 4);
    // blips
    for (const bl of blips()) {
      let [sx, sy] = map(bl.x, bl.z);
      const dx = sx - R, dy = sy - R, d = Math.hypot(dx, dy), edge = R - 12;
      if (d > edge) {
        if (!bl.always) continue;
        sx = R + (dx / d) * edge; sy = R + (dy / d) * edge;
      }
      if (bl.dot) {
        ctx.fillStyle = bl.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (bl.square) ctx.rect(sx - bl.r, sy - bl.r, bl.r * 2, bl.r * 2); else ctx.arc(sx, sy, bl.r, 0, 6.3);
        ctx.fill(); ctx.stroke();
      } else drawGlyphBlip(ctx, sx, sy, bl.icon, bl.color, bl.r);
    }
    ctx.restore();
    // player arrow (points along the body's heading relative to the view)
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(view - P.heading);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0b0b12'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7.5, 8); ctx.lineTo(0, 4); ctx.lineTo(-7.5, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // rim: wanted flashes red/blue, otherwise a sunset gradient
    ctx.lineWidth = 5;
    if (G.wanted?.stars > 0) ctx.strokeStyle = copColor();
    else { const g = ctx.createLinearGradient(0, 0, w, w); g.addColorStop(0, '#ffd166'); g.addColorStop(0.5, '#ff5fa2'); g.addColorStop(1, '#8a5cff'); ctx.strokeStyle = g; }
    ctx.beginPath(); ctx.arc(R, R, R - 3, 0, 6.3); ctx.stroke();
    // north indicator on the rim
    const north = map(P.x, P.z - 1000);
    const nd = Math.hypot(north[0] - R, north[1] - R) || 1;
    const px = R + ((north[0] - R) / nd) * (R - 4), py = R + ((north[1] - R) / nd) * (R - 4);
    ctx.fillStyle = '#0b0b12'; ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = "900 12px Bahnschrift, 'Arial Narrow', Arial, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', px, py + 0.5);
  };

  // ---- full-screen map (north-up). Returns the world<->screen transform for click handling.
  S.drawFull = (fc) => {
    const ctx = fc.getContext('2d');
    const w = fc.width, h = fc.height;
    ctx.fillStyle = '#0c2f46';
    ctx.fillRect(0, 0, w, h);
    const sc = (Math.min(w, h) / size) * 0.97;
    const ox = (w - size * sc) / 2, oy = (h - size * sc) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, ox, oy, size * sc, size * sc);
    const k = BAKE * sc;
    const tx = (x) => ox + (x + EXTENT) * k, tz = (z) => oy + (z + EXTENT) * k;
    S.fullTransform = { toWorld: (sx, sy) => ({ x: (sx - ox) / k - EXTENT, z: (sy - oy) / k - EXTENT }) };
    const font = (wgt, px) => `${wgt} ${px}px Bahnschrift, 'Arial Narrow', Arial, sans-serif`;
    // district names
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(800, 20);
    for (const [id, [x, z]] of Object.entries(DISTRICT_LABELS)) {
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(DISTRICTS[id].name.toUpperCase(), tx(x), tz(z));
      ctx.fillStyle = DISTRICTS[id].color; ctx.fillText(DISTRICTS[id].name.toUpperCase(), tx(x), tz(z));
    }
    // street names along the outer edges
    ctx.font = font(600, 10); ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i <= N; i += 2) {
      ctx.save(); ctx.translate(tx(nodeX(i)), tz(-HALF - 22)); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.fillText(STREETS_NS[i], 0, 0); ctx.restore();
      ctx.textAlign = 'right'; ctx.fillText(STREETS_EW[i], tx(-HALF - 14), tz(nodeZ(i)));
    }
    ctx.textAlign = 'center';
    // search area, route
    const s = searchArea();
    if (s) { ctx.fillStyle = 'rgba(255,60,90,0.22)'; ctx.beginPath(); ctx.arc(tx(s.x), tz(s.z), s.radius * k, 0, 6.3); ctx.fill(); }
    const P = G.player;
    const t = gpsTarget();
    if (t) strokeRoute(ctx, gps(P.x, P.z, t.x, t.z), (x, z) => [tx(x), tz(z)], 4);
    for (const bl of blips()) {
      if (bl.dot) { ctx.fillStyle = bl.color; ctx.beginPath(); ctx.arc(tx(bl.x), tz(bl.z), 4, 0, 6.3); ctx.fill(); continue; }
      drawGlyphBlip(ctx, tx(bl.x), tz(bl.z), bl.icon, bl.color, 9);
    }
    // landmark labels
    ctx.font = font(700, 12);
    for (const m of G.markers.list) {
      if (!m.label) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(m.label, tx(m.x), tz(m.z) - 16);
      ctx.fillStyle = '#fff'; ctx.fillText(m.label, tx(m.x), tz(m.z) - 16);
    }
    // player
    ctx.save();
    ctx.translate(tx(P.x), tz(P.z));
    ctx.rotate(Math.PI - P.heading);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  bake();
  return S;
}
