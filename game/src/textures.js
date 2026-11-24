// Procedural canvas textures: building facades, roads, ground, clouds and neon signs.
import * as THREE from 'three';
import { makeRng } from './random.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(ctx, w, h, amount, rng) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Facade with punched windows: a 4x4 bay tile (16m x 14m). Returns {map, emissive}.
export function makeFacadeTextures() {
  const S = 512, B = S / 4;
  const [c, x] = canvas(S, S);
  const [e, ex] = canvas(S, S);
  const rng = makeRng(77);
  x.fillStyle = '#f2efe9';
  x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, S, S);
  noise(x, S, S, 10, rng);
  for (let r = 0; r < 4; r++) {
    // floor slab line
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(0, r * B + B - 6, S, 6);
    for (let q = 0; q < 4; q++) {
      const wx = q * B + 22, wy = r * B + 20, ww = B - 44, wh = B - 50;
      const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, '#6aa6c8');
      g.addColorStop(0.5, '#27506b');
      g.addColorStop(1, '#15283a');
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.beginPath();
      x.moveTo(wx, wy);
      x.lineTo(wx + ww * 0.45, wy);
      x.lineTo(wx, wy + wh * 0.55);
      x.fill();
      if (rng() < 0.5) {
        ex.fillStyle = rng() < 0.7 ? '#ffd48a' : '#bfe6ff';
        ex.globalAlpha = 0.65 + rng() * 0.35;
        ex.fillRect(wx, wy, ww, wh);
        ex.globalAlpha = 1;
      }
    }
  }
  return { map: tex(c), emissive: tex(e) };
}

// Glass curtain wall tile for towers.
export function makeCurtainTextures() {
  const S = 512, P = S / 8;
  const [c, x] = canvas(S, S);
  const [e, ex] = canvas(S, S);
  const rng = makeRng(31);
  x.fillStyle = '#9fb4c2';
  x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) {
    for (let q = 0; q < 8; q++) {
      const g = x.createLinearGradient(q * P, r * P, q * P + P, r * P + P);
      const t = rng() * 0.25;
      g.addColorStop(0, `rgba(${150 + t * 100},${210 + t * 40},255,1)`);
      g.addColorStop(1, `rgba(${30 + t * 60},${70 + t * 50},${110 + t * 60},1)`);
      x.fillStyle = g;
      x.fillRect(q * P + 3, r * P + 3, P - 6, P - 6);
      if (rng() < 0.4) {
        ex.fillStyle = rng() < 0.6 ? '#ffe2a8' : '#c9ecff';
        ex.globalAlpha = 0.5 + rng() * 0.5;
        ex.fillRect(q * P + 4, r * P + 4, P - 8, P - 8);
        ex.globalAlpha = 1;
      }
    }
  }
  x.strokeStyle = 'rgba(30,40,50,0.9)';
  x.lineWidth = 6;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * P, 0); x.lineTo(i * P, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * P); x.lineTo(S, i * P); x.stroke();
  }
  return { map: tex(c), emissive: tex(e) };
}

// Road strip: u across the 18 m width, v along the length (18 m per repeat).
export function makeRoadTexture() {
  const S = 256;
  const [c, x] = canvas(S, S);
  const rng = makeRng(5);
  x.fillStyle = '#3b3e46';
  x.fillRect(0, 0, S, S);
  noise(x, S, S, 22, rng);
  // patches and cracks
  for (let i = 0; i < 6; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.08})`;
    x.fillRect(rng() * S, rng() * S, 20 + rng() * 60, 10 + rng() * 40);
  }
  const line = (u0, u1, color) => {
    x.fillStyle = color;
    x.fillRect(u0 * S, 0, (u1 - u0) * S, S);
  };
  line(0.5 - 0.022, 0.5 - 0.01, '#f5c542');
  line(0.5 + 0.01, 0.5 + 0.022, '#f5c542');
  line(0.035, 0.047, '#e9e9e9');
  line(0.953, 0.965, '#e9e9e9');
  return tex(c);
}

// Intersection: asphalt with zebra crossings on all four sides.
export function makeIntersectionTexture() {
  const S = 256;
  const [c, x] = canvas(S, S);
  const rng = makeRng(9);
  x.fillStyle = '#3b3e46';
  x.fillRect(0, 0, S, S);
  noise(x, S, S, 22, rng);
  x.fillStyle = 'rgba(235,235,235,0.9)';
  const m = S / 18; // pixels per metre
  for (let i = 0; i < 18; i += 1.0) {
    if (i < 1.2 || i > 16.8) continue;
    x.fillRect(i * m, 0.6 * m, 0.5 * m, 3 * m);
    x.fillRect(i * m, S - 3.6 * m, 0.5 * m, 3 * m);
    x.fillRect(0.6 * m, i * m, 3 * m, 0.5 * m);
    x.fillRect(S - 3.6 * m, i * m, 3 * m, 0.5 * m);
  }
  return tex(c);
}

export function makeGrassTexture() {
  const S = 128;
  const [c, x] = canvas(S, S);
  const rng = makeRng(12);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = 200 + rng() * 55;
    x.fillStyle = `rgba(${v - 30},${v},${v - 50},0.35)`;
    x.fillRect(rng() * S, rng() * S, 2, 2 + rng() * 3);
  }
  return tex(c);
}

export function makeConcreteTexture() {
  const S = 128;
  const [c, x] = canvas(S, S);
  const rng = makeRng(3);
  x.fillStyle = '#d6d0c6';
  x.fillRect(0, 0, S, S);
  noise(x, S, S, 18, rng);
  x.strokeStyle = 'rgba(0,0,0,0.18)';
  x.strokeRect(0.5, 0.5, S - 1, S - 1);
  return tex(c);
}

export function makeCloudTexture() {
  const S = 256;
  const [c, x] = canvas(S, S / 2);
  const rng = makeRng(21);
  for (let i = 0; i < 38; i++) {
    const px = S * (0.2 + 0.6 * rng()), py = S * 0.25 + (rng() - 0.5) * 30, r = 18 + rng() * 40;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
  return tex(c, false);
}

// Neon / shop sign: bright text on a dark panel.
export function makeSignTexture(text, fg = '#ffffff', bg = '#1b1b2a', w = 256, h = 96) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = fg;
  x.lineWidth = 5;
  x.strokeRect(5, 5, w - 10, h - 10);
  x.fillStyle = fg;
  x.shadowColor = fg;
  x.shadowBlur = 14;
  let size = 52;
  x.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
  while (x.measureText(text).width > w - 36 && size > 12) {
    size -= 2;
    x.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
  }
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 3);
  return tex(c, false);
}

// Soft radial blob used for shadows under props and ground glow.
export function makeBlobTexture() {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

// Warm radial glow used for street-lamp pools of light at night.
export function makeGlowTexture() {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,1)');
  g.addColorStop(0.4, 'rgba(255,190,110,0.45)');
  g.addColorStop(1, 'rgba(255,170,90,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return tex(c, false);
}
