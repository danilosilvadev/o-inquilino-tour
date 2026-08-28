/**
 * Figure.js — the tenant.
 *
 * The body is drawn, not modelled: a little 2D skeleton, and a cloud of stipple
 * marks that belong to its bones. Because every mark stores (bone, t, u) rather
 * than a fixed position, the same cloud can stand, stoop, or heave against a
 * weight — the drawing is re-posed instead of re-drawn.
 */

export const BONES = [
  // name        A            B           width   profile
  ['head',      'neckBase',  'headTop',   0.150, 'round'],
  ['neck',      'sternum',   'neckBase',  0.058, 'taper'],
  ['chest',     'pelvis',    'sternum',   0.118, 'torso'],
  ['shoulders', 'shoulderL', 'shoulderR', 0.055, 'taper'],
  ['hips',      'hipL',      'hipR',      0.055, 'taper'],
  ['armLU',     'shoulderL', 'elbowL',    0.044, 'taper'],
  ['armLF',     'elbowL',    'handL',     0.034, 'taper'],
  ['armRU',     'shoulderR', 'elbowR',    0.044, 'taper'],
  ['armRF',     'elbowR',    'handR',     0.034, 'taper'],
  ['legLU',     'hipL',      'kneeL',     0.060, 'taper'],
  ['legLF',     'kneeL',     'footL',     0.045, 'taper'],
  ['legRU',     'hipR',      'kneeR',     0.060, 'taper'],
  ['legRF',     'kneeR',     'footR',     0.045, 'taper']
];

/** standing, but not comfortably */
export const POSE_IDLE = {
  headTop:   [0.000, 1.000], neckBase:  [0.000, 0.828],
  sternum:   [0.000, 0.778], pelvis:    [0.000, 0.470],
  shoulderL: [-0.092, 0.792], shoulderR: [0.092, 0.792],
  elbowL:    [-0.128, 0.628], elbowR:    [0.133, 0.628],
  handL:     [-0.138, 0.452], handR:     [0.158, 0.440],
  hipL:      [-0.052, 0.470], hipR:      [0.052, 0.470],
  kneeL:     [-0.066, 0.242], kneeR:     [0.070, 0.242],
  footL:     [-0.062, 0.010], footR:     [0.064, 0.010]
};

/** bent under it: head down, spine folded, hands hauling back past the hips */
export const POSE_HAUL = {
  headTop:   [0.168, 0.742], neckBase:  [0.100, 0.652],
  sternum:   [0.042, 0.648], pelvis:    [-0.032, 0.412],
  shoulderL: [-0.040, 0.632], shoulderR: [0.162, 0.612],
  elbowL:    [-0.152, 0.528], elbowR:    [0.252, 0.500],
  handL:     [-0.198, 0.362], handR:     [0.282, 0.338],
  hipL:      [-0.080, 0.412], hipR:      [0.036, 0.418],
  kneeL:     [-0.190, 0.220], kneeR:     [0.146, 0.200],
  footL:     [-0.262, 0.010], footR:     [0.192, 0.010]
};

const JOINTS = Object.keys(POSE_IDLE);

/**
 * Scatter stipple marks over the skeleton.
 * Each mark remembers which bone it belongs to and where on it, so it follows.
 */
export function sampleFigure(count, heightUnits) {
  const widthUnits = heightUnits * 0.62;

  // budget points by how much ink each bone deserves
  const areas = BONES.map(([, a, b, w]) => {
    const A = POSE_IDLE[a], B = POSE_IDLE[b];
    const len = Math.hypot((B[0] - A[0]) * widthUnits, (B[1] - A[1]) * heightUnits);
    return Math.max(len, 0.02) * w * widthUnits;
  });
  const total = areas.reduce((s, a) => s + a, 0);

  const bone = [];
  const tuj = [];
  const seeds = [];

  BONES.forEach(([name, , , w, profile], bi) => {
    const n = Math.max(24, Math.round((areas[bi] / total) * count));
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      let u = Math.random() * 2 - 1;

      // the outline of the limb, baked once — it rotates with the bone later
      let k;
      if (profile === 'round') {
        k = Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
        u *= k;
      } else if (profile === 'torso') {
        k = 0.72 + 0.28 * Math.sin(Math.PI * Math.min(t * 1.15, 1));
        u *= k;
      } else {
        k = 1 - 0.35 * t;
        u *= k;
      }

      bone.push(bi);
      tuj.push(t, u * w * widthUnits, (Math.random() - 0.5) * heightUnits * 0.07);
      seeds.push(Math.random(), Math.random(), Math.random(), t);
    }
  });

  return {
    count: bone.length,
    bone: new Float32Array(bone),
    tuj: new Float32Array(tuj),
    seeds: new Float32Array(seeds),
    boneCount: BONES.length
  };
}

/** blend the two poses, then shove a heave of effort through the result */
export function poseJoints(haul, heave, out = {}) {
  for (const j of JOINTS) {
    const a = POSE_IDLE[j], b = POSE_HAUL[j];
    out[j] = [a[0] + (b[0] - a[0]) * haul, a[1] + (b[1] - a[1]) * haul];
  }
  if (haul > 0.001 && heave !== 0) {
    // the pull comes from the legs and travels up; the head arrives last
    const push = heave * haul;
    out.headTop[0]   += push * 0.075; out.headTop[1]   -= Math.abs(push) * 0.045;
    out.neckBase[0]  += push * 0.058; out.neckBase[1]  -= Math.abs(push) * 0.032;
    out.sternum[0]   += push * 0.040; out.sternum[1]   -= Math.abs(push) * 0.022;
    out.pelvis[0]    += push * 0.024;
    out.shoulderL[0] += push * 0.050; out.shoulderR[0] += push * 0.050;
    out.elbowL[0]    += push * 0.030; out.elbowR[0]    += push * 0.030;
    out.handL[0]     += push * 0.012; out.handR[0]     += push * 0.012;
    out.kneeL[1]     -= Math.abs(push) * 0.038;
    out.kneeR[1]     -= Math.abs(push) * 0.030;
  }
  return out;
}

/** joint positions → the bone endpoints the shader skins against */
export function boneEndpoints(joints, heightUnits, A, B) {
  const widthUnits = heightUnits * 0.62;
  BONES.forEach(([, a, b], i) => {
    const ja = joints[a], jb = joints[b];
    A[i * 3] = ja[0] * widthUnits;
    A[i * 3 + 1] = ja[1] * heightUnits;
    A[i * 3 + 2] = 0;
    B[i * 3] = jb[0] * widthUnits;
    B[i * 3 + 1] = jb[1] * heightUnits;
    B[i * 3 + 2] = 0;
  });
}


/**
 * Charcoal, not stipple.
 *
 * Each stroke is a wandering polyline laid out in a bone's own (t, u) space —
 * t runs along the limb, u across it — so it loops and doubles back the way a
 * hand does when it is shading fast. Skinning is identical to the stipple, so
 * the scribble bends with the pose.
 */
export function sampleScribble(cfg, heightUnits) {
  const widthUnits = heightUnits * 0.62;
  const bone = [];
  const tuj = [];
  const press = [];
  const hairFlag = [];

  const push = (bi, t0, u0, d0, t1, u1, d1, pr, hair) => {
    bone.push(bi, bi);
    tuj.push(t0, u0, d0, t1, u1, d1);
    press.push(pr, pr);
    hairFlag.push(hair, hair);
  };

  const headIndex = BONES.findIndex((b) => b[0] === 'head');

  BONES.forEach(([name, , , w, profile], bi) => {
    const isHead = name === 'head';
    const strokes = Math.round((isHead ? cfg.headStrokes : cfg.strokes) *
                               (profile === 'torso' ? 1.7 : 1));
    const halfW = w * widthUnits;

    const shape = (tc) => profile === 'round'
      ? Math.sqrt(Math.max(0, Math.sin(Math.PI * tc)))
      : profile === 'torso'
        ? 0.72 + 0.28 * Math.sin(Math.PI * Math.min(tc * 1.15, 1))
        : 1 - 0.35 * tc;

    for (let sIdx = 0; sIdx < strokes; sIdx++) {
      const K = cfg.segments;
      // most strokes run the length of the limb; a few cut across it for tone
      const across = Math.random() < cfg.acrossRatio;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const pr = 0.30 + Math.random() * 0.70;
      const depth = (Math.random() - 0.5) * heightUnits * 0.05;

      let t, span, freq, amp, steps;
      if (across) {
        // a short scrub of shading, held at one height
        steps = Math.max(3, Math.round(K * 0.35));
        t = Math.random();
        span = (dir * (0.02 + Math.random() * 0.06)) / steps;
        freq = 2.2 + Math.random() * 2.0;
        amp = 0.75 + Math.random() * 0.5;
      } else {
        // a long contour stroke that wanders as it travels
        steps = K;
        const cover = 0.55 + Math.random() * 0.5;
        t = dir > 0 ? Math.random() * (1 - cover * 0.6) : 1 - Math.random() * (1 - cover * 0.6);
        span = (dir * cover) / steps;
        freq = 0.22 + Math.random() * 0.75;
        amp = 0.35 + Math.random() * 0.6;
      }
      const phase = Math.random() * 6.283;

      let prev = null;
      for (let k = 0; k <= steps; k++) {
        const tc = Math.min(1, Math.max(0, t + span * k));
        const u = Math.sin(k * freq + phase) * amp * halfW * shape(tc);
        const cur = [tc, u, depth];
        if (prev) push(bi, prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], pr, 0);
        prev = cur;
      }
    }
  });

  // ── the hair: a dark mass, drawn fast, falling over the face ──
  for (let sIdx = 0; sIdx < cfg.hairStrokes; sIdx++) {
    const K = cfg.segments;
    const side = Math.random() < 0.5 ? -1 : 1;
    const root = 0.55 + Math.random() * 0.55;        // where on the skull it starts
    const fall = 0.55 + Math.random() * 0.85;        // how far down it hangs
    const sway = 0.6 + Math.random() * 1.5;
    const pr = 0.55 + Math.random() * 0.45;
    const depth = (Math.random() - 0.5) * heightUnits * 0.07;
    const halfW = BONES[headIndex][3] * widthUnits;

    let prev = null;
    for (let k = 0; k <= K; k++) {
      const f = k / K;
      const t = root - fall * f;                      // runs down the skull and past it
      const u = side * halfW * (0.35 + 1.25 * Math.sin(Math.PI * Math.min(f * 1.3, 1)))
              + Math.sin(k * sway + sIdx) * halfW * 0.35;
      const cur = [t, u, depth];
      if (prev) push(headIndex, prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], pr, 1);
      prev = cur;
    }
  }

  return {
    count: bone.length,
    bone: new Float32Array(bone),
    tuj: new Float32Array(tuj),
    press: new Float32Array(press),
    hair: new Float32Array(hairFlag)
  };
}
