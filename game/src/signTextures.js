// Canvas-painted signage for invented local businesses: shopfronts, billboards and art-deco hotel blade signs.
// Every name here is made up for Palmera Bay.
import { canvas, tex } from './textures.js';
import { makeRng } from './random.js';

const FONT = (px, w = 'bold') => `${w} ${px}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;

function fitText(x, text, maxW, px, weight) {
  let size = px;
  x.font = FONT(size, weight);
  while (x.measureText(text).width > maxW && size > 10) x.font = FONT((size -= 2), weight);
  return size;
}

function neonText(x, text, cx, cy, maxW, px, color, glow = 18) {
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  fitText(x, text, maxW, px);
  x.shadowColor = color;
  x.shadowBlur = glow;
  x.fillStyle = color;
  x.fillText(text, cx, cy);
  x.shadowBlur = 0;
  x.fillStyle = 'rgba(255,255,255,0.75)';
  x.fillText(text, cx, cy);
}

// ---- shopfronts: 2 x 4 cells of 512 x 256 (each maps to a 9 m x 4.5 m ground-floor bay)
export const SHOPS = [
  { name: 'MANGO MART', sign: '#ffb627', band: '#1f6f5c', inside: '#ffe7b0' },
  { name: 'BRISA CAFE', sign: '#ff7aa8', band: '#2b2140', inside: '#ffd9a8' },
  { name: 'PIXEL PAWN', sign: '#6ee7ff', band: '#1b1f3a', inside: '#c8e6ff' },
  { name: 'TIDE WASH', sign: '#8dffb0', band: '#1a4a6b', inside: '#e8fbff' },
  { name: 'VOLT PHONES', sign: '#c792ff', band: '#141826', inside: '#dfe8ff' },
  { name: 'PALOMA DELI', sign: '#ffd166', band: '#7a2e2e', inside: '#ffe2b8' },
  { name: 'KOKO NAILS', sign: '#ff9de2', band: '#3d1f4a', inside: '#ffe0f2' },
  { name: 'LUCKY NOODLE', sign: '#ff5d5d', band: '#1d1d1d', inside: '#ffd0a0' },
];

export function makeShopfrontAtlas() {
  const W = 512, H = 256;
  const [c, x] = canvas(W * 2, H * 4);
  const [e, ex] = canvas(W * 2, H * 4);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, W * 2, H * 4);
  const rng = makeRng(61);
  SHOPS.forEach((s, k) => {
    const ox = (k % 2) * W, oy = (3 - (k >> 1)) * H; // cell k sits at row k>>1 counted from the texture bottom
    x.save(); x.translate(ox, oy);
    ex.save(); ex.translate(ox, oy);
    // wall frame
    x.fillStyle = '#e8e2d8'; x.fillRect(0, 0, W, H);
    // sign band
    x.fillStyle = s.band; x.fillRect(8, 6, W - 16, 64);
    neonText(x, s.name, W / 2, 39, W - 60, 46, s.sign, 14);
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    neonText(ex, s.name, W / 2, 39, W - 60, 46, s.sign, 20);
    // display window with a warm interior and shelf silhouettes
    const gx = 20, gy = 84, gw = W - 150, gh = H - 96;
    const g = x.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, '#29313b'); g.addColorStop(1, '#0e1218');
    x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
    const gi = ex.createLinearGradient(0, gy, 0, gy + gh);
    gi.addColorStop(0, s.inside); gi.addColorStop(1, '#3a2a1a');
    ex.fillStyle = gi; ex.fillRect(gx, gy, gw, gh);
    for (let r = 0; r < 3; r++) {
      const sy = gy + 30 + r * 42;
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(gx + 10, sy, gw - 20, 4);
      ex.fillStyle = 'rgba(0,0,0,0.55)'; ex.fillRect(gx + 10, sy, gw - 20, 5);
      for (let q = 0; q < 9; q++) {
        const col = `hsl(${Math.floor(rng() * 360)},70%,${45 + rng() * 25}%)`;
        x.fillStyle = col; ex.fillStyle = 'rgba(0,0,0,0.35)';
        const bx = gx + 16 + q * ((gw - 32) / 9), bw = 14 + rng() * 14, bh = 12 + rng() * 18;
        x.fillRect(bx, sy - bh, bw, bh);
        ex.fillRect(bx, sy - bh, bw, bh);
      }
    }
    // reflection streak and mullion
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.beginPath(); x.moveTo(gx + 40, gy); x.lineTo(gx + 110, gy); x.lineTo(gx + 20, gy + gh); x.lineTo(gx, gy + gh); x.fill();
    x.fillStyle = '#c9c4bb'; x.fillRect(gx + gw / 2 - 3, gy, 6, gh);
    // door
    const dx = W - 116, dw = 92;
    x.fillStyle = '#c9c4bb'; x.fillRect(dx - 6, gy - 4, dw + 12, gh + 4);
    x.fillStyle = '#1c232c'; x.fillRect(dx, gy, dw, gh);
    ex.fillStyle = s.inside; ex.globalAlpha = 0.7; ex.fillRect(dx, gy, dw, gh); ex.globalAlpha = 1;
    x.fillStyle = '#d8d2c6'; x.fillRect(dx + dw - 16, gy + gh / 2, 6, 28);
    // "OPEN" plaque
    x.fillStyle = '#111'; x.fillRect(gx + gw - 74, gy + 10, 60, 22);
    neonText(x, 'OPEN', gx + gw - 44, gy + 21, 54, 18, '#ff4f6d', 8);
    neonText(ex, 'OPEN', gx + gw - 44, gy + 21, 54, 18, '#ff4f6d', 10);
    x.restore(); ex.restore();
  });
  return { map: tex(c, false), emissive: tex(e, false) };
}

// ---- billboards: 2 x 4 cells of 512 x 256 adverts for invented brands
const ADS = [
  (x, w, h) => { // soda
    bg(x, w, h, ['#ff8a3d', '#ff3d7f']);
    sun(x, w * 0.8, h * 0.45, 70, 'rgba(255,230,120,0.9)');
    bottle(x, w * 0.8, h * 0.55, '#ffd166');
    title(x, 'PAPAYA POP', 40, h * 0.42, '#fff8e8', 'left', 64);
    tagline(x, 'tastes like the weekend', 44, h * 0.68, '#fff3d6', 'left');
  },
  (x, w, h) => { // airline
    bg(x, w, h, ['#4cc9f0', '#1d6fd6']);
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.beginPath(); x.moveTo(w * 0.62, h * 0.55); x.lineTo(w * 0.95, h * 0.32); x.lineTo(w * 0.98, h * 0.38); x.lineTo(w * 0.7, h * 0.6); x.fill();
    x.fillRect(w * 0.74, h * 0.42, 50, 8);
    title(x, 'TIDEWAY AIR', 36, h * 0.42, '#ffffff', 'left', 60);
    tagline(x, 'nonstop to anywhere warm', 40, h * 0.68, '#e8f6ff', 'left');
  },
  (x, w, h) => { // phone
    bg(x, w, h, ['#141826', '#3a1f5d']);
    x.fillStyle = '#0b0b10'; roundRect(x, w * 0.68, h * 0.12, 90, 190, 14); x.fill();
    const g = x.createLinearGradient(0, h * 0.15, 0, h * 0.85);
    g.addColorStop(0, '#ff4fd8'); g.addColorStop(1, '#4cc9f0');
    x.fillStyle = g; roundRect(x, w * 0.68 + 6, h * 0.12 + 8, 78, 174, 10); x.fill();
    title(x, 'NOVA9', 40, h * 0.42, '#ffffff', 'left', 84);
    tagline(x, 'brighter than the night', 44, h * 0.7, '#c9b8ff', 'left');
  },
  (x, w, h) => { // rum
    bg(x, w, h, ['#2b1608', '#7a3e12']);
    sun(x, w * 0.5, h * 1.05, 150, 'rgba(255,180,70,0.5)');
    title(x, 'SALT & GOLD', w / 2, h * 0.38, '#ffd27a', 'center', 64);
    tagline(x, 'island rum · aged by the sea', w / 2, h * 0.66, '#ffe9c2', 'center');
  },
  (x, w, h) => { // news
    bg(x, w, h, ['#e63946', '#a3122a']);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(w * 0.18, h * 0.5, 70, 0, 6.3); x.fill();
    title(x, '7', w * 0.18, h * 0.52, '#e63946', 'center', 110);
    title(x, 'BAY 7 NEWS', w * 0.62, h * 0.42, '#ffffff', 'center', 58);
    tagline(x, 'first on the scene', w * 0.62, h * 0.68, '#ffe0e0', 'center');
  },
  (x, w, h) => { // sunscreen
    bg(x, w, h, ['#ffe066', '#ffa94d']);
    sun(x, w * 0.15, h * 0.3, 60, '#fff3b0');
    x.fillStyle = '#ff5d73'; roundRect(x, w * 0.78, h * 0.2, 64, 160, 18); x.fill();
    x.fillStyle = '#fff'; x.fillRect(w * 0.78 + 10, h * 0.45, 44, 20);
    title(x, 'GLOW SPF 50', w * 0.45, h * 0.45, '#2b2140', 'center', 60);
    tagline(x, 'stay golden, not burnt', w * 0.45, h * 0.7, '#5a2b40', 'center');
  },
  (x, w, h) => { // electric car
    bg(x, w, h, ['#e8f1f5', '#9fd6c9']);
    x.fillStyle = '#1b2d52';
    x.beginPath(); x.moveTo(w * 0.55, h * 0.72); x.lineTo(w * 0.62, h * 0.52); x.lineTo(w * 0.8, h * 0.47); x.lineTo(w * 0.95, h * 0.62); x.lineTo(w * 0.96, h * 0.72); x.fill();
    x.fillStyle = '#111'; for (const wx of [0.63, 0.88]) { x.beginPath(); x.arc(w * wx, h * 0.74, 16, 0, 6.3); x.fill(); }
    title(x, 'ORBITA EV', 36, h * 0.4, '#1b2d52', 'left', 62);
    tagline(x, 'silent. electric. yours.', 40, h * 0.66, '#2a5a5a', 'left');
  },
  (x, w, h) => { // condos
    bg(x, w, h, ['#ffcfd8', '#c792ff']);
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 4; k++) x.fillRect(w * 0.66 + k * 36, h * (0.7 - k * 0.12) - 40, 30, 300);
    title(x, 'CASA MIRAGE', 36, h * 0.4, '#3d1f4a', 'left', 58);
    tagline(x, 'oceanfront living · now leasing', 40, h * 0.66, '#5a2b60', 'left');
  },
];

function bg(x, w, h, cols) {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function sun(x, cx, cy, r, col) {
  x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
}
function bottle(x, cx, cy, col) {
  x.fillStyle = col; roundRect(x, cx - 22, cy - 40, 44, 110, 12); x.fill();
  x.fillRect(cx - 9, cy - 70, 18, 34);
  x.fillStyle = '#fff'; x.fillRect(cx - 22, cy, 44, 22);
}
function title(x, t, px, py, col, align, size) {
  x.textAlign = align; x.textBaseline = 'middle';
  fitText(x, t, 300, size);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillText(t, px + 3, py + 3);
  x.fillStyle = col; x.fillText(t, px, py);
}
function tagline(x, t, px, py, col, align) {
  x.textAlign = align; x.textBaseline = 'middle';
  x.font = 'italic 600 24px "Trebuchet MS", "Segoe UI", sans-serif';
  x.fillStyle = col; x.fillText(t, px, py);
}
function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
}

export const AD_COUNT = ADS.length;

export function makeBillboardAtlas() {
  const W = 512, H = 256;
  const [c, x] = canvas(W * 2, H * 4);
  ADS.forEach((draw, k) => {
    x.save();
    x.translate((k % 2) * W, (3 - (k >> 1)) * H);
    x.beginPath(); x.rect(0, 0, W, H); x.clip();
    draw(x, W, H);
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
    x.restore();
  });
  const t = tex(c, false);
  t.anisotropy = 8;
  return t;
}

// ---- vertical neon blade signs for Coral Beach hotels: 8 cells of 128 x 512
export const HOTELS = [
  ['FLAMINGA', '#ff6fb5'], ['CORALINE', '#ff9a6b'], ['AZURE', '#6ee7ff'], ['PALOMA', '#ffd166'],
  ['MARISOL', '#8dffb0'], ['SEABREEZE', '#7aa8ff'], ['MIRAGE', '#c792ff'], ['ROSALIA', '#ff5d73'],
];

export function makeHotelSignAtlas() {
  const W = 128, H = 512;
  const [c, x] = canvas(W * 8, H);
  HOTELS.forEach(([name, col], k) => {
    x.save();
    x.translate(k * W, 0);
    x.fillStyle = '#f6f1e8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1d1a2a'; x.fillRect(10, 10, W - 20, H - 20);
    x.strokeStyle = col; x.lineWidth = 5; x.shadowColor = col; x.shadowBlur = 12;
    x.strokeRect(18, 18, W - 36, H - 36);
    const letters = name.split('');
    const step = (H - 70) / letters.length;
    const size = Math.min(64, step * 0.95);
    letters.forEach((ch, i) => neonText(x, ch, W / 2, 36 + step * (i + 0.5), W - 40, size, col, 16));
    x.restore();
  });
  return tex(c, false);
}
