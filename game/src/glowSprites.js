// Cheap bloom stand-in: soft additive halos (one draw call) around lamps, neon, beacons and signs.
// Mesh builders call addGlow() while building; buildGlows() bakes everything into a single Points object.
import * as THREE from 'three';
import { WORLD } from './worldUniforms.js';

const MODES = { night: 0, blink: 1, always: 2, flicker: 3 };
const pending = [];

// size: halo diameter in metres; mode: 'night' | 'blink' | 'always' | 'flicker'; alpha: peak strength.
export function addGlow(x, y, z, size, color, mode = 'night', alpha = 0.6) {
  pending.push({ x, y, z, size, color: new THREE.Color(color), mode: MODES[mode] ?? 0, alpha });
}

const VERT = `
attribute float size; attribute vec3 tint; attribute vec2 info;
uniform float uScale, uTime, uNight;
varying vec3 vTint; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  float mode = info.x, a = info.y;
  float phase = fract(sin(dot(position.xz, vec2(12.99, 78.23))) * 437.5);
  float k = uNight;
  if (mode > 0.5 && mode < 1.5) k = (0.3 + 0.7 * uNight) * step(fract(uTime * 0.7 + phase), 0.45);
  else if (mode > 1.5 && mode < 2.5) k = 1.0;
  else if (mode > 2.5) k = uNight * (0.75 + 0.25 * step(0.08, fract(uTime * 1.3 + phase * 9.0)));
  vAlpha = a * k * (1.0 - smoothstep(500.0, 1000.0, dist));
  vTint = tint;
  gl_PointSize = vAlpha < 0.003 ? 0.0 : min(size * uScale / max(dist, 0.5), 900.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vTint; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d2 = dot(c, c) * 4.0;
  float g = exp(-d2 * 9.0) * 0.9 + exp(-d2 * 2.6) * 0.35;
  g *= 1.0 - smoothstep(0.7, 1.0, d2);
  if (g * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vTint * g * vAlpha, 1.0);
}`;

export function buildGlows(scene) {
  const n = pending.length;
  const pos = new Float32Array(n * 3), tint = new Float32Array(n * 3), size = new Float32Array(n), info = new Float32Array(n * 2);
  pending.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    tint.set([p.color.r, p.color.g, p.color.b], i * 3);
    size[i] = p.size;
    info.set([p.mode, p.alpha], i * 2);
  });
  pending.length = 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('info', new THREE.BufferAttribute(info, 2));
  const uniforms = { uScale: { value: 600 }, uTime: WORLD.uTime, uNight: WORLD.uNight };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  const buf = new THREE.Vector2();
  points.onBeforeRender = (renderer, _s, camera) => {
    renderer.getDrawingBufferSize(buf);
    uniforms.uScale.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
  scene.add(points);
  return points;
}
