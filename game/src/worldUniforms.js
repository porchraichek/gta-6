// Shared shader uniforms (world time, night factor) and small material patches that use them.
// environment.js advances these every frame, so city materials animate without extra per-frame hooks.
import * as THREE from 'three';

export const WORLD = {
  uTime: { value: 0 },
  uNight: { value: 0 },
};

// Make a material's emissive (or, for unlit materials, its colour) scale between a day and a night level.
export function nightGlow(material, dayLevel, nightLevel, key = 'nightGlow') {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.call(material, sh, r);
    sh.uniforms.uNight = WORLD.uNight;
    sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader;
    const k = `mix(${dayLevel.toFixed(3)}, ${nightLevel.toFixed(3)}, uNight)`;
    if (sh.fragmentShader.includes('#include <emissivemap_fragment>') && material.isMeshStandardMaterial) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance *= ${k};`);
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= ${k};`);
    }
  };
  material.customProgramCacheKey = () => `${key}:${dayLevel}:${nightLevel}`;
  return material;
}

// Gentle wind sway for instanced foliage: displacement grows with height above the instance origin.
export function windSway(material, strength = 0.35, height = 8) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WORLD.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec2 seed = instanceMatrix[3].xz;
        #else
          vec2 seed = vec2(0.0);
        #endif
        float ph = seed.x * 0.37 + seed.y * 0.21;
        float k = pow(max(transformed.y, 0.0) / ${height.toFixed(1)}, 2.0) * ${strength.toFixed(3)};
        float gust = 0.65 + 0.35 * sin(uTime * 0.31 + ph * 0.1);
        transformed.x += (sin(uTime * 1.15 + ph) + 0.35 * sin(uTime * 2.7 + ph * 1.7)) * k * gust;
        transformed.z += cos(uTime * 0.93 + ph * 1.3) * k * 0.6 * gust;
      }`);
  };
  material.customProgramCacheKey = () => `sway:${strength}:${height}`;
  return material;
}
