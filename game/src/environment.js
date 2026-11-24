// Sky dome, sun/moon lighting, day-night colour keyframes, clouds, stars and the animated sea.
import * as THREE from 'three';
import { makeCloudTexture } from './textures.js';
import { makeRng, clamp } from './random.js';

const KEYS = [
  { h: 0, top: 0x040818, mid: 0x0b1538, hor: 0x1b2a58, sun: 0x9db8ff, sunI: 0.0, moonI: 0.55, hemi: 0x30406e, ground: 0x151a2b, hemiI: 0.55, fog: 0x16224a },
  { h: 4.6, top: 0x0d1a44, mid: 0x2a3466, hor: 0x6a5a8a, sun: 0xffa07a, sunI: 0.0, moonI: 0.4, hemi: 0x4a5a8e, ground: 0x2a2a3a, hemiI: 0.6, fog: 0x4a4e7a },
  { h: 5.6, top: 0x3d62a8, mid: 0xe0907f, hor: 0xffc08a, sun: 0xffb27a, sunI: 1.6, moonI: 0, hemi: 0x9aaad4, ground: 0x6d5a52, hemiI: 0.8, fog: 0xf2b58f },
  { h: 8, top: 0x2d7ae0, mid: 0x78b8f2, hor: 0xd6e9ff, sun: 0xfff1d6, sunI: 3.0, moonI: 0, hemi: 0xbcdcff, ground: 0x8a7a66, hemiI: 1.05, fog: 0xcfe3f7 },
  { h: 12, top: 0x1f6fe0, mid: 0x69b0f2, hor: 0xcfe6ff, sun: 0xfffaf0, sunI: 3.4, moonI: 0, hemi: 0xc4e0ff, ground: 0x8e8068, hemiI: 1.15, fog: 0xc6dcf2 },
  { h: 16, top: 0x2a72d6, mid: 0x7db8ee, hor: 0xf6e2c4, sun: 0xffe2b0, sunI: 3.0, moonI: 0, hemi: 0xc4daf5, ground: 0x8d7a60, hemiI: 1.05, fog: 0xe7d8c0 },
  { h: 17.8, top: 0x3a68c4, mid: 0xf0a468, hor: 0xffc68e, sun: 0xffb36e, sunI: 2.5, moonI: 0, hemi: 0xffd2a8, ground: 0x9a6f55, hemiI: 0.9, fog: 0xf5be8c },
  { h: 19, top: 0x23367a, mid: 0xdc5f7c, hor: 0xff8a5c, sun: 0xff7a4a, sunI: 1.1, moonI: 0.15, hemi: 0xc07a9a, ground: 0x4f3a45, hemiI: 0.7, fog: 0xe0728a },
  { h: 20.2, top: 0x0f1a48, mid: 0x4a3a7c, hor: 0xc8607c, sun: 0xff6a4a, sunI: 0.0, moonI: 0.35, hemi: 0x4a548a, ground: 0x2a2535, hemiI: 0.55, fog: 0x4c3a6c },
  { h: 22, top: 0x050a1e, mid: 0x0c173c, hor: 0x1c2a58, sun: 0x9db8ff, sunI: 0.0, moonI: 0.55, hemi: 0x30406e, ground: 0x151a2b, hemiI: 0.55, fog: 0x16224a },
  { h: 24, top: 0x040818, mid: 0x0b1538, hor: 0x1b2a58, sun: 0x9db8ff, sunI: 0.0, moonI: 0.55, hemi: 0x30406e, ground: 0x151a2b, hemiI: 0.55, fog: 0x16224a },
];

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 topColor, midColor, horColor, sunDir, sunColor; uniform float night;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(horColor, midColor, smoothstep(0.0, 0.25, h));
  col = mix(col, topColor, smoothstep(0.2, 0.9, h));
  col = mix(col, horColor*0.8, smoothstep(0.0,-0.3,h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 6.0)*0.22 + pow(sd, 48.0)*0.35 + pow(sd, 1400.0)*6.0);
  float sdm = max(dot(d, normalize(-sunDir)), 0.0);
  col += vec3(0.75,0.82,1.0) * pow(sdm, 900.0) * 2.5 * night;
  vec3 g = floor(d*220.0);
  float s = step(0.9965, hash(g)) * smoothstep(0.02,0.4,h);
  col += vec3(s) * night * (0.55 + 0.45*hash(g+3.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const SEA_VERT = `
varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SEA_FRAG = `
varying vec3 vWorld;
uniform vec3 deep, shallow, skyColor, sunDir, sunColor, fogColor, camPos; uniform float time, fogFar, night;
vec3 waveN(vec2 p, float t){
  float a = sin(p.x*0.11+t*0.9)*0.5 + sin(p.y*0.17-t*0.7)*0.5 + sin((p.x+p.y)*0.31+t*1.7)*0.35 + sin((p.x-p.y)*0.57-t*2.3)*0.2;
  float b = cos(p.x*0.13-t*0.8)*0.5 + cos(p.y*0.21+t*1.1)*0.5 + cos((p.x-p.y)*0.41+t*1.9)*0.3 + cos((p.x+p.y)*0.63-t*2.1)*0.2;
  return normalize(vec3(a*0.18, 1.0, b*0.18));
}
void main(){
  vec3 V = normalize(camPos - vWorld);
  vec3 n = waveN(vWorld.xz, time);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  float dcoast = clamp((length(max(abs(vWorld.xz) - 610.0, 0.0))) / 160.0, 0.0, 1.0);
  vec3 base = mix(shallow, deep, smoothstep(0.0, 1.0, dcoast));
  vec3 col = mix(base, skyColor, fres*0.75);
  vec3 R = reflect(-V, n);
  float sp = pow(max(dot(R, normalize(sunDir)), 0.0), 220.0);
  col += sunColor * sp * 3.0;
  col += sunColor * pow(max(dot(R, normalize(sunDir)), 0.0), 12.0) * 0.12;
  // foam near shore
  float foam = (1.0 - smoothstep(0.0, 0.12, dcoast)) * (0.5 + 0.5*sin(vWorld.x*0.5+vWorld.z*0.5+time*2.0));
  col = mix(col, vec3(1.0), foam*0.35);
  col *= mix(1.0, 0.55, night);
  float dist = length(camPos - vWorld);
  float f = smoothstep(fogFar*0.25, fogFar, dist);
  gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
}`;

const col = (hex) => new THREE.Color(hex);

export function createEnvironment(scene, renderer, camera) {
  scene.fog = new THREE.Fog(0xcfe3f7, 140, 1100);
  const hemi = new THREE.HemisphereLight(0xbcdcff, 0x8a7a66, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const skyUniforms = {
    topColor: { value: col(0x2a72d6) }, midColor: { value: col(0x7db8ee) }, horColor: { value: col(0xf6e2c4) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: col(0xffe2b0) }, night: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 20),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const seaUniforms = {
    deep: { value: col(0x0b5c86) }, shallow: { value: col(0x35c4c9) }, skyColor: { value: col(0xcfe6ff) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: col(0xffe2b0) }, fogColor: { value: col(0xcfe3f7) },
    camPos: { value: new THREE.Vector3() }, time: { value: 0 }, fogFar: { value: 1100 }, night: { value: 0 },
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1), new THREE.ShaderMaterial({ uniforms: seaUniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.9;
  scene.add(sea);

  // drifting clouds
  const cloudTex = makeCloudTexture();
  const clouds = [];
  const rng = makeRng(99);
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(380 + rng() * 300, 170 + rng() * 80), mat);
    const a = rng() * Math.PI * 2, r = 500 + rng() * 800;
    m.position.set(Math.cos(a) * r, 230 + rng() * 140, Math.sin(a) * r);
    m.userData.speed = 2 + rng() * 3;
    m.rotation.x = Math.PI / 2;
    m.rotation.z = rng() * 6;
    m.renderOrder = -5;
    scene.add(m);
    clouds.push(m);
  }

  // image-based lighting from the sky itself, refreshed as the day moves
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const skyProbe = new THREE.Mesh(sky.geometry, sky.material);
  skyScene.add(skyProbe);
  let envTarget = null, envHour = -99;
  function refreshEnvironment() {
    envHour = env.hour;
    const old = envTarget;
    envTarget = pmrem.fromScene(skyScene, 0, 0.1, 3000);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.55 + 0.25 * (1 - env.night);
    old?.dispose();
  }

  const env = {
    sun, hemi, sky, sea, hour: 17.6, night: 0, sunDir: new THREE.Vector3(), skyColor: new THREE.Color(), fogColor: new THREE.Color(), time: 0,
    setHour(h) {
      env.hour = ((h % 24) + 24) % 24;
      apply();
    },
  };

  const kA = {}, kB = {};
  const tmp = new THREE.Color();
  function sample() {
    let i = 0;
    while (i < KEYS.length - 2 && env.hour >= KEYS[i + 1].h) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const t = clamp((env.hour - A.h) / (B.h - A.h), 0, 1);
    const s = t * t * (3 - 2 * t);
    const mix = (k) => new THREE.Color(A[k]).lerp(tmp.set(B[k]), s);
    kA.top = mix('top'); kA.mid = mix('mid'); kA.hor = mix('hor'); kA.sun = mix('sun'); kA.hemi = mix('hemi'); kA.ground = mix('ground'); kA.fog = mix('fog');
    kA.sunI = A.sunI + (B.sunI - A.sunI) * s;
    kA.moonI = A.moonI + (B.moonI - A.moonI) * s;
    kA.hemiI = A.hemiI + (B.hemiI - A.hemiI) * s;
  }

  function apply() {
    sample();
    const a = ((env.hour - 5.2) / 14.4) * Math.PI;
    env.sunDir.set(Math.cos(a) * 0.92, Math.sin(a), 0.38).normalize();
    const elev = env.sunDir.y;
    env.night = clamp(1 - (elev + 0.08) / 0.26, 0, 1);
    skyUniforms.topColor.value.copy(kA.top);
    skyUniforms.midColor.value.copy(kA.mid);
    skyUniforms.horColor.value.copy(kA.hor);
    skyUniforms.sunDir.value.copy(env.sunDir);
    skyUniforms.sunColor.value.copy(kA.sun).multiplyScalar(elev > -0.05 ? 1 : 0);
    skyUniforms.night.value = env.night;
    hemi.color.copy(kA.hemi);
    hemi.groundColor.copy(kA.ground);
    hemi.intensity = kA.hemiI * 0.85;
    const useSun = kA.sunI > 0.01 && elev > -0.02;
    if (useSun) {
      sun.color.copy(kA.sun);
      sun.intensity = kA.sunI * clamp(elev * 6, 0.25, 1);
      env.lightDir = env.sunDir;
    } else {
      sun.color.setHex(0x8ea8ff);
      sun.intensity = kA.moonI;
      env.lightDir = env.sunDir.clone().negate();
      if (env.lightDir.y < 0.15) env.lightDir.y = 0.15 + (0.15 - env.lightDir.y) * 0.2;
      env.lightDir.normalize();
    }
    scene.fog.color.copy(kA.fog);
    env.fogColor.copy(kA.fog);
    env.skyColor.copy(kA.hor);
    seaUniforms.skyColor.value.copy(kA.hor).lerp(kA.mid, 0.4);
    seaUniforms.fogColor.value.copy(kA.fog);
    seaUniforms.sunDir.value.copy(env.sunDir);
    seaUniforms.sunColor.value.copy(kA.sun).multiplyScalar(elev > -0.05 ? 1 : 0.0);
    seaUniforms.night.value = env.night;
    for (const c of clouds) c.material.color.copy(kA.hor).lerp(new THREE.Color(1, 1, 1), 0.35 * (1 - env.night)).multiplyScalar(1 - env.night * 0.8);
  }

  env.update = (dt, camPos, focus) => {
    env.time += dt;
    if (Math.abs(env.hour - envHour) > 0.3) refreshEnvironment();
    sky.position.copy(camPos);
    sea.position.x = Math.round(camPos.x / 50) * 50;
    sea.position.z = Math.round(camPos.z / 50) * 50;
    seaUniforms.time.value = env.time;
    seaUniforms.camPos.value.copy(camPos);
    // keep the shadow frustum centred on the focus, snapped to texels
    const snap = 220 / 2048;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + env.lightDir.x * 300, env.lightDir.y * 300, fz + env.lightDir.z * 300);
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1400) c.position.x = -1400;
    }
  };

  apply();
  refreshEnvironment();
  return env;
}
