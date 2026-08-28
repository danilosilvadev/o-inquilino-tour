import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * One combined final pass: iris, tremor, chromatic bleed, grain, vignette, grade.
 * Kept to a single fullscreen pass so it stays smooth on integrated graphics.
 */
/**
 * One combined final pass: iris, tremor, chromatic bleed, grain, vignette, grade.
 * Kept to a single fullscreen pass so it stays smooth on integrated graphics.
 */
export const FilmShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uRes:        { value: new THREE.Vector2(1, 1) },
    uIris:       { value: 0 },        // 0 = shut, 1 = open
    uTremor:     { value: 0 },
    uGrain:      { value: 0.085 },
    uGrainSize:  { value: 1.35 },
    uVignette:   { value: 1.12 },
    uAberration: { value: 0.0022 },
    uContrast:   { value: 1.06 },
    uExposure:   { value: 1.02 },
    uFlash:      { value: 0 }         // the cold spike of lucidity
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime, uIris, uTremor, uGrain, uGrainSize;
    uniform float uVignette, uAberration, uContrast, uExposure, uFlash;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;

      // tremor — the shake in "e como tremia diante da lucidez"
      if (uTremor > 0.0001) {
        float t = uTime * 46.0;
        uv += vec2(
          (hash(vec2(floor(t), 3.7)) - 0.5),
          (hash(vec2(floor(t), 9.1)) - 0.5)
        ) * uTremor;
      }

      // chromatic bleed, stronger toward the edges
      vec2 dir = uv - 0.5;
      float r2 = dot(dir, dir);
      float ab = uAberration * (0.35 + r2 * 3.4);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + dir * ab).b;

      // grade: lift the blacks a hair cold, push contrast
      col *= uExposure;
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(0.004, 0.006, 0.012) * (1.0 - col.r);
      col += vec3(0.30, 0.16, 0.13) * uFlash;

      // vignette
      float vig = 1.0 - smoothstep(0.24, 0.88, length(dir) * uVignette);
      col *= mix(0.28, 1.0, vig);

      // iris — the eye opening on "hoje eu acordei"
      vec2 e = dir * vec2(1.0, 1.85);
      float lid = length(e) * 1.25;
      float open = smoothstep(0.0, 1.0, uIris);
      float irisMask = smoothstep(lid - 0.16, lid + 0.02, open * 1.35);
      col *= irisMask;

      // grain, last, so it sits on top like emulsion
      vec2 gp = floor(gl_FragCoord.xy / max(uGrainSize, 0.5));
      float n = hash(gp + fract(uTime) * 137.0);
      col += (n - 0.5) * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `
};

export function buildComposer(renderer, scene, camera, cfg) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const film = new ShaderPass(FilmShader);
  film.renderToScreen = true;
  const u = film.uniforms;
  u.uGrain.value = cfg.grain;
  u.uGrainSize.value = cfg.grainSize;
  u.uVignette.value = cfg.vignette;
  u.uAberration.value = cfg.aberration;
  u.uContrast.value = cfg.contrast;
  u.uExposure.value = cfg.exposure;
  composer.addPass(film);

  return { composer, film };
}
