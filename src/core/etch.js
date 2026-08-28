/**
 * etch.js — the drawn substrate.
 *
 * Everything in this piece is a print: an inked plate on toned paper. Surfaces do
 * not get "shaded", they get *hatched* — a luminance value chooses how many layers
 * of crosshatch bite into the paper, and the lines wander because a hand drew them.
 *
 * Hatching is computed in SURFACE space so it sticks to the wall as the camera
 * moves (a plate mark belongs to the object). Paper tooth is added later, in SCREEN
 * space, because the paper belongs to the print, not to the room.
 */

export const NOISE = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
    return s;
  }
  float fbm2(vec2 p) { return fbm(vec3(p, 0.0)); }
`;

export const ETCH = /* glsl */ `
  // ── the burin ────────────────────────────────────────────────────────
  // hp is in HATCH UNITS: one unit = one line spacing, measured in screen
  // pixels. The whole frame is one plate at one scale, the way a drawing is —
  // which is also why nothing moirés when the camera moves through perspective.

  float hatchLayer(vec2 hp, float ang, float amt, float wob, float phase) {
    if (amt <= 0.002) return 0.0;
    vec2 d = vec2(cos(ang), sin(ang));
    float s = dot(hp, d) + wob + phase;
    float f = abs(fract(s) - 0.5) * 2.0;
    // a stroke is never one weight along its length
    float weight = amt * (0.82 + 0.36 * fbm2(hp * 0.11 + phase * 7.0));
    float thick = clamp(mix(0.04, 0.80, weight), 0.0, 0.86);
    return 1.0 - smoothstep(thick, thick + 0.30, f);
  }

  // luminance in, ink out. four rulings, each biting deeper as the light goes
  float etchInk(vec2 hp, float lum, float wander) {
    // the hand wanders across a few line spacings, and jitters within one
    float slow = (fbm2(hp * 0.13) - 0.5) * wander * 2.6;
    float fast = (fbm2(hp * 0.62) - 0.5) * wander * 0.7;
    float w = slow + fast;

    float ink = 0.0;
    ink = max(ink, hatchLayer(hp,  0.66, 1.0 - smoothstep(0.38, 1.00, lum), w,        0.0));
    ink = max(ink, hatchLayer(hp, -0.62, 1.0 - smoothstep(0.20, 0.70, lum), w * 1.25, 0.37));
    ink = max(ink, hatchLayer(hp,  1.49, 1.0 - smoothstep(0.08, 0.44, lum), w * 0.80, 0.71));
    ink = max(ink, hatchLayer(hp,  2.36, 1.0 - smoothstep(0.00, 0.22, lum), w * 1.60, 0.13));

    // even the blackest passage keeps a little tooth showing
    return clamp(ink, 0.0, 0.985);
  }

  // the plate is never wiped evenly — this is the tone it keeps
  float plateTone(vec2 uv) {
    return 0.88 + 0.12 * fbm2(uv * 2.3);
  }
`;
