// Building facade atlases: 2x2 styles per texture (albedo + window mask). Walls are drawn near-white so
// per-building vertex colours tint them; the window mask is lit per-window in the building shader.
import { canvas, tex, noise } from './textures.js';
import { makeRng } from './random.js';

export const FACADE_STYLE = { modern: 0, deco: 1, stucco: 2, industrial: 3 };
export const GLASS_STYLE = { grid: 0, ribbon: 1, fins: 2, dark: 3 };

const S = 512; // one style cell; covers 16 m x 14 m = 4 bays x 4 floors (facade) or 8 x 8 panels (glass)
const B = S / 4;

function atlas(drawers, seed) {
  const [c, x] = canvas(S * 2, S * 2);
  const [e, ex] = canvas(S * 2, S * 2);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, S * 2, S * 2);
  const rng = makeRng(seed);
  drawers.forEach((draw, k) => {
    // cell k -> (col k%2, row from bottom k>>1); canvas y is flipped relative to texture v
    const ox = (k % 2) * S, oy = S - (k >> 1) * S;
    x.save(); ex.save();
    x.translate(ox, oy); ex.translate(ox, oy);
    x.beginPath(); x.rect(0, 0, S, S); x.clip();
    draw(x, ex, rng);
    x.restore(); ex.restore();
  });
  noise(x, S * 2, S * 2, 9, rng);
  const map = tex(c), mask = tex(e);
  map.anisotropy = mask.anisotropy = 8;
  return { map, emissive: mask };
}

function windowGlass(x, wx, wy, ww, wh, rng, tone = 1) {
  const g = x.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
  const t = rng() * 0.15;
  g.addColorStop(0, `rgb(${(150 + t * 200) * tone},${(195 + t * 100) * tone},${225 * tone})`);
  g.addColorStop(0.45, `rgb(${60 * tone},${95 * tone},${125 * tone})`);
  g.addColorStop(1, `rgb(${28 * tone},${42 * tone},${60 * tone})`);
  x.fillStyle = g;
  x.fillRect(wx, wy, ww, wh);
  x.fillStyle = 'rgba(255,255,255,0.16)';
  x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx + ww * 0.5, wy); x.lineTo(wx, wy + wh * 0.6); x.fill();
}

function mask(ex, wx, wy, ww, wh) {
  ex.fillStyle = '#fff';
  ex.fillRect(wx, wy, ww, wh);
}

// 0: modern punched windows with deep reveals and slab lines
function modern(x, ex, rng) {
  x.fillStyle = '#f1eee8'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) {
    x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, r * B + B - 8, S, 8);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, r * B + B - 10, S, 2);
    for (let q = 0; q < 4; q++) {
      const wx = q * B + 20, wy = r * B + 22, ww = B - 40, wh = B - 52;
      x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      windowGlass(x, wx, wy, ww, wh, rng);
      x.fillStyle = 'rgba(235,235,235,0.9)';
      x.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(wx - 6, wy + wh + 3, ww + 12, 5); // sill
      mask(ex, wx, wy, ww, wh);
    }
  }
}

// 1: art-deco: pilasters between bays, paired tall windows, eyebrow shades and spandrel grooves
function deco(x, ex, rng) {
  x.fillStyle = '#f7f4ef'; x.fillRect(0, 0, S, S);
  for (let q = 0; q <= 4; q++) {
    const px = q * B - 10;
    const g = x.createLinearGradient(px, 0, px + 20, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g; x.fillRect(px, 0, 20, S);
  }
  for (let r = 0; r < 4; r++) {
    const y0 = r * B;
    // spandrel grooves
    x.fillStyle = 'rgba(0,0,0,0.13)';
    for (let k = 0; k < 3; k++) x.fillRect(0, y0 + 100 + k * 7, S, 2);
    for (let q = 0; q < 4; q++) {
      const bx = q * B;
      // eyebrow ledge with soft shadow below
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(bx + 16, y0 + 14, B - 32, 5);
      const sg = x.createLinearGradient(0, y0 + 19, 0, y0 + 34);
      sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = sg; x.fillRect(bx + 18, y0 + 19, B - 36, 15);
      for (const off of [24, 68]) {
        const wx = bx + off, wy = y0 + 24, ww = 36, wh = 68;
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        windowGlass(x, wx, wy, ww, wh, rng, 1.05);
        x.fillStyle = 'rgba(240,240,240,0.85)';
        x.fillRect(wx, wy + 22, ww, 3); x.fillRect(wx, wy + 45, ww, 3);
        mask(ex, wx, wy, ww, wh);
      }
    }
  }
}

// 2: warm stucco with shuttered windows and little wrought-iron balconettes
function stucco(x, ex, rng) {
  x.fillStyle = '#f4efe6'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.04})`;
    const r = 6 + rng() * 26;
    x.beginPath(); x.arc(rng() * S, rng() * S, r, 0, 6.3); x.fill();
  }
  for (let r = 0; r < 4; r++) {
    const y0 = r * B;
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, y0 + B - 5, S, 5);
    for (let q = 0; q < 4; q++) {
      const wx = q * B + 38, wy = y0 + 26, ww = 52, wh = 70;
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      windowGlass(x, wx, wy, ww, wh, rng, 0.95);
      x.fillStyle = 'rgba(250,250,250,0.9)'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + 24, ww, 3);
      mask(ex, wx, wy, ww, wh);
      // shutters: slatted, slightly darker than the wall so the tint reads as a deeper shade
      for (const sx of [wx - 24, wx + ww + 3]) {
        x.fillStyle = 'rgba(70,90,80,0.55)'; x.fillRect(sx, wy - 2, 21, wh + 4);
        x.fillStyle = 'rgba(255,255,255,0.18)';
        for (let k = 0; k < wh; k += 6) x.fillRect(sx + 2, wy + k, 17, 2);
      }
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(wx - 8, wy + wh + 3, ww + 16, 6);
      if ((q + r) % 2 === 0) {
        x.strokeStyle = 'rgba(30,30,35,0.75)'; x.lineWidth = 2;
        x.strokeRect(wx - 6, wy + wh - 22, ww + 12, 24);
        for (let k = wx - 6; k < wx + ww + 6; k += 6) { x.beginPath(); x.moveTo(k, wy + wh - 22); x.lineTo(k, wy + wh + 2); x.stroke(); }
      }
    }
  }
}

// 3: industrial corrugated cladding with a clerestory band and a roll-up door per bay pair
function industrial(x, ex, rng) {
  x.fillStyle = '#e9ebec'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < S; k += 8) {
    x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(k, 0, 3, S);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(k + 4, 0, 2, S);
  }
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 36, S, 60);
  for (let k = 0; k < S; k += 32) {
    const wx = k + 3, wy = 40, ww = 26, wh = 52;
    windowGlass(x, wx, wy, ww, wh, rng, 0.9);
    mask(ex, wx, wy, ww, wh);
  }
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(0, S - 12, S, 12);
  for (const dx of [40, 296]) {
    const w = 176, h = 168, y = S - 12 - h;
    x.fillStyle = 'rgba(40,45,50,0.35)'; x.fillRect(dx - 6, y - 6, w + 12, h + 6);
    x.fillStyle = 'rgba(205,208,210,1)'; x.fillRect(dx, y, w, h);
    x.fillStyle = 'rgba(0,0,0,0.16)';
    for (let k = 0; k < h; k += 10) x.fillRect(dx, y + k, w, 3);
    x.fillStyle = 'rgba(255,190,40,0.85)'; x.fillRect(dx - 6, y - 14, w + 12, 6);
  }
  x.fillStyle = 'rgba(90,60,40,0.12)'; // rust streaks
  for (let i = 0; i < 18; i++) x.fillRect(rng() * S, 100 + rng() * 200, 3, 40 + rng() * 120);
}

export function makeFacadeAtlas() {
  return atlas([modern, deco, stucco, industrial], 77);
}

// ---- glass curtain walls (8 x 8 panels per cell, 2 m x 1.75 m each)
const P = S / 8;

function glassGrid(x, ex, rng) {
  x.fillStyle = '#9fb4c2'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
    const g = x.createLinearGradient(q * P, r * P, q * P + P, r * P + P);
    const t = rng() * 0.25;
    g.addColorStop(0, `rgb(${170 + t * 80},${215 + t * 40},255)`);
    g.addColorStop(1, `rgb(${50 + t * 60},${90 + t * 50},${130 + t * 60})`);
    x.fillStyle = g; x.fillRect(q * P + 3, r * P + 3, P - 6, P - 6);
    mask(ex, q * P + 4, r * P + 4, P - 8, P - 8);
  }
  x.strokeStyle = 'rgba(40,50,60,0.9)'; x.lineWidth = 6;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * P, 0); x.lineTo(i * P, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * P); x.lineTo(S, i * P); x.stroke();
  }
}

function glassRibbon(x, ex, rng) {
  x.fillStyle = '#f2f2f0'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) {
    const y = r * P;
    const g = x.createLinearGradient(0, y, S, y + P);
    g.addColorStop(0, '#d6ecfa'); g.addColorStop(0.5, '#5a7d96'); g.addColorStop(1, '#a8c8dc');
    x.fillStyle = g; x.fillRect(0, y + 4, S, P - 22);
    mask(ex, 0, y + 5, S, P - 24);
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, y + P - 18, S, 3);
    x.fillStyle = 'rgba(60,70,80,0.8)';
    for (let q = 0; q <= 8; q++) x.fillRect(q * P - 1, y + 4, 3, P - 22);
  }
  noise(x, S, S, 6, rng);
}

function glassFins(x, ex, rng) {
  x.fillStyle = '#c8b9a0'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
    const g = x.createLinearGradient(q * P, r * P, q * P, r * P + P);
    const t = rng() * 0.2;
    g.addColorStop(0, `rgb(${230 - t * 60},${205 - t * 60},${160 - t * 40})`);
    g.addColorStop(1, `rgb(${90 + t * 40},${70 + t * 30},${50 + t * 20})`);
    x.fillStyle = g; x.fillRect(q * P + 2, r * P + 3, P - 4, P - 6);
    mask(ex, q * P + 3, r * P + 4, P - 6, P - 8);
  }
  for (let q = 0; q <= 8; q += 2) {
    const g = x.createLinearGradient(q * P - 9, 0, q * P + 9, 0);
    g.addColorStop(0, '#9a9690'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#b4b0aa');
    x.fillStyle = g; x.fillRect(q * P - 9, 0, 18, S);
  }
}

function glassDark(x, ex, rng) {
  x.fillStyle = '#4b5966'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
    const t = rng() * 0.18;
    x.fillStyle = `rgb(${70 + t * 120},${92 + t * 120},${112 + t * 120})`;
    x.fillRect(q * P + 2, r * P + 2, P - 4, P - 4);
    mask(ex, q * P + 3, r * P + 3, P - 6, P - 6);
  }
  const g = x.createLinearGradient(0, S, S, 0);
  g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(0.62, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(235,240,245,0.9)';
  for (let r = 0; r <= 8; r += 2) x.fillRect(0, r * P - 4, S, 8);
}

export function makeCurtainAtlas() {
  return atlas([glassGrid, glassRibbon, glassFins, glassDark], 31);
}
