import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { sampleFigure, sampleScribble, poseJoints, boneEndpoints, BONES } from '../core/Figure.js';
import { beatProgress, envelope, smoothstep, lerp } from '../core/Scrubber.js';
import { NOISE } from '../core/etch.js';
import { CutoutFigure } from '../core/CutoutFigure.js';
import figureBack from '../config/figure-back.json';


export class CantoI_P1 {
  constructor(cfg, poem) {
    this.cfg = cfg;
    this.poem = poem;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(cfg.palette.void);
    this.scene.fog = new THREE.Fog(cfg.palette.void, 6, 32);

    this.bone = new THREE.Color(cfg.palette.bone);
    this.ink = this.bone;                       // marks are drawn in bone, on black
    this.blood = new THREE.Color(cfg.palette.blood);

    this.camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, cfg.camera.near, cfg.camera.far);
    this.camera.position.set(0, cfg.camera.yStart, cfg.camera.zStart);

    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.textGroups = [];

    this._buildCorridor();
    this._buildBody();
    this._buildScribble();
    this._buildHeart();
    this._buildScratches();
    this._buildWallBlood();
    this._buildGravel();
    this._buildDragMarks();

    // the drawing itself, cut into rigid parts
    this.cutout = new CutoutFigure(figureBack, cfg.cutout, cfg.palette);
    this.scene.add(this.cutout.root);

    // and the one that is a moment behind it. not a ghost, not a shadow —
    // the same body, failing to arrive at the same time as itself.
    this.double = new CutoutFigure(figureBack, cfg.cutout, cfg.palette);
    this.double.root.scale.setScalar(cfg.double.scale);
    this.scene.add(this.double.root);
    this._lag = new THREE.Vector3();
  }

  // ── the room you are renting ─────────────────────────
  _buildCorridor() {
    const c = this.cfg.corridor;
    this.plaster = new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uBone:      { value: new THREE.Color(this.cfg.palette.bone) },
        uBlood:     { value: new THREE.Color(this.cfg.palette.blood) },
        uLucid:     { value: 0 },
        uBleed:     { value: 0 },
        uHead:      { value: new THREE.Vector3(0, 1.5, 0) },
        uStain:     { value: c.stainScale },
        uCrack:     { value: c.crackScale },
        uCrackBite:  { value: c.crackBite },
        uCrackPatch: { value: c.crackPatch },
        uCrackDepth: { value: c.crackDepth },
        uDrip:       { value: c.drip },
        uDamp:      { value: c.damp },
        uFalloff:   { value: c.lampFalloff },
        uLampBase:  { value: c.lampBase },
        uLampLucid: { value: c.lampLucid },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vNormal2;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNormal2 = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime, uLucid, uBleed, uStain, uCrack, uCrackBite, uCrackPatch, uCrackDepth, uDamp, uDrip;
        uniform float uFalloff, uLampBase, uLampLucid;
        uniform vec3 uBone, uBlood, uHead;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        ${NOISE}

        void main() {
          vec3 p = vWorld;

          // damp stains that bleed downward
          vec3 sp = p * uStain;
          sp.y -= fbm(p * 0.7) * uDrip;
          float stain = smoothstep(0.28, 0.78, fbm(sp));

          // ── cracks ──
          // a wall does not craze evenly. one ridge network gives the lines;
          // a slow second field decides where the wall is broken at all, so
          // they read as a few real splits instead of marbling.
          float ridge = abs(fbm(p * uCrack) - 0.5) * 2.0;
          float crack = 1.0 - smoothstep(0.0, uCrackBite, ridge);
          crack *= smoothstep(uCrackPatch, uCrackPatch + 0.16, fbm(p * 0.42 + 13.0));

          // fine tooth of the plaster
          float tooth = fbm(p * 26.0) * 0.16;

          float lum = 0.030 + stain * 0.10 * uDamp + tooth * 0.35;
          lum -= crack * uCrackDepth;

          // the lamp inside the skull, travelling with the reader
          float d = length(p - uHead);
          float flicker = 0.86 + 0.14 * fbm(vec3(uTime * 2.3, 0.0, 0.0));
          lum += exp(-d * d * uFalloff) * (uLampBase + uLucid * uLampLucid * flicker);

          vec3 col = uBone * lum;
          col = mix(col, col * vec3(0.86, 0.9, 1.05), 0.55);   // plaster reads cold

          // and where the hands have been, the splits run
          float upright = 1.0 - abs(normalize(vNormal2).y);
          col = mix(col, uBlood * (0.35 + lum * 2.2),
                    crack * uBleed * upright * exp(-d * 0.22));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const g = new THREE.Group();
    const L = c.length;
    const zMid = -L * 0.5 + 6;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(c.width, L, 1, 1), this.plaster);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    g.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(c.width, L, 1, 1), this.plaster);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, c.height, zMid);
    g.add(ceil);

    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, c.height, 1, 1), this.plaster);
      wall.rotation.y = s * Math.PI / 2;
      wall.position.set(s * c.width * 0.5, c.height * 0.5, zMid);
      g.add(wall);
    }

    const end = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), this.plaster);
    end.position.set(0, c.height * 0.5, zMid - L * 0.5);
    g.add(end);

    this.corridor = g;
    this.scene.add(g);
  }

  // ── the borrowed body ────────────────────────────────
  _buildBody() {
    const b = this.cfg.body;
    const fig = sampleFigure(b.count, b.height);
    this.figure = fig;

    const geo = new THREE.BufferGeometry();
    // a dummy position attribute keeps three's bookkeeping happy; the real
    // placement comes from the bones
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fig.count * 3), 3));
    geo.setAttribute('aBone', new THREE.BufferAttribute(fig.bone, 1));
    geo.setAttribute('aTUJ', new THREE.BufferAttribute(fig.tuj, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(fig.seeds, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, b.height * 0.5, 0), b.height * 1.5);

    this.boneA = new Float32Array(fig.boneCount * 3);
    this.boneB = new Float32Array(fig.boneCount * 3);
    this.joints = poseJoints(0, 0);
    boneEndpoints(this.joints, b.height, this.boneA, this.boneB);

    this.bodyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime:     { value: 0 },
        uSize:     { value: b.pointSize },
        uDrift:    { value: b.drift },
        uDriftSpd: { value: b.driftSpeed },
        uSag:      { value: 0 },
        uTremble:  { value: 0 },
        uOpacity:  { value: 0 },
        uHeight:   { value: b.height },
        uDPR:      { value: 1 },
        uBoneA:    { value: this.boneA },
        uBoneB:    { value: this.boneB },
        uBone:     { value: new THREE.Color(this.cfg.palette.bone) }
      },
      vertexShader: /* glsl */ `
        attribute float aBone;
        attribute vec3 aTUJ;          // t along bone, u across it, depth jitter
        attribute vec4 aSeed;
        uniform vec3 uBoneA[${BONES.length}];
        uniform vec3 uBoneB[${BONES.length}];
        uniform float uTime, uSize, uDrift, uDriftSpd, uSag, uTremble, uHeight, uDPR;
        varying float vAlpha;

        void main() {
          int bi = int(aBone + 0.5);
          vec3 A = uBoneA[bi];
          vec3 B = uBoneB[bi];
          vec3 axis = B - A;

          // the mark sits where it always sat on this bone — the bone moved
          vec2 axis2 = axis.xy;                 // 'flat' is reserved in GLSL
          float len = max(length(axis2), 1e-4);
          vec2 perp = vec2(-axis2.y, axis2.x) / len;

          vec3 p = A + axis * aTUJ.x;
          p.xy += perp * aTUJ.y;
          p.z += aTUJ.z;

          float rank = clamp(p.y / uHeight, 0.0, 1.0);
          float tau = 6.2831853;

          // never still — the flesh is not at rest
          p.x += sin(uTime * uDriftSpd + aSeed.x * tau) * uDrift * (0.35 + rank);
          p.y += cos(uTime * uDriftSpd * 0.83 + aSeed.y * tau) * uDrift * 0.6;
          p.z += sin(uTime * uDriftSpd * 0.61 + aSeed.z * tau) * uDrift * 0.55;

          // the weight settles from the head down
          p.y -= uSag * pow(rank, 1.7) * (0.55 + aSeed.x * 0.9);

          // and under real strain it shakes
          p.x += sin(uTime * 27.0 + aSeed.z * tau) * uTremble * (0.2 + rank);
          p.y += cos(uTime * 31.0 + aSeed.x * tau) * uTremble * 0.7;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uDPR * (7.5 / max(-mv.z, 0.4)), 5.0);
          vAlpha = 0.35 + aSeed.y * 0.65;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uBone;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = (1.0 - smoothstep(0.02, 0.25, r)) * vAlpha * uOpacity;
          gl_FragColor = vec4(uBone * a, a);
        }
      `
    });

    this.body = new THREE.Points(geo, this.bodyMat);
    this.body.frustumCulled = false;
    this.body.position.set(b.x, 0, -9.0);
    this.scene.add(this.body);
  }

  // ── the charcoal ─────────────────────────────────────
  _buildScribble() {
    const b = this.cfg.body;
    const sc = sampleScribble(this.cfg.scribble, b.height);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sc.count * 3), 3));
    geo.setAttribute('aBone', new THREE.BufferAttribute(sc.bone, 1));
    geo.setAttribute('aTUJ', new THREE.BufferAttribute(sc.tuj, 3));
    geo.setAttribute('aPress', new THREE.BufferAttribute(sc.press, 1));
    geo.setAttribute('aHair', new THREE.BufferAttribute(sc.hair, 1));

    this.scribbleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime:     { value: 0 },
        uDrift:    { value: b.drift },
        uDriftSpd: { value: b.driftSpeed },
        uSag:      { value: 0 },
        uTremble:  { value: 0 },
        uOpacity:  { value: 0 },
        uHeight:   { value: b.height },
        uHairDroop:{ value: this.cfg.scribble.hairDroop },
        uBoneA:    { value: this.boneA },
        uBoneB:    { value: this.boneB },
        uBone:     { value: new THREE.Color(this.cfg.palette.bone) },
        uHairInk:  { value: new THREE.Color(this.cfg.palette.hair) }
      },
      vertexShader: /* glsl */ `
        attribute float aBone;
        attribute vec3 aTUJ;
        attribute float aPress;
        attribute float aHair;
        uniform vec3 uBoneA[${BONES.length}];
        uniform vec3 uBoneB[${BONES.length}];
        uniform float uTime, uDrift, uDriftSpd, uSag, uTremble, uHeight, uHairDroop;
        varying float vPress;
        varying float vHair;

        void main() {
          int bi = int(aBone + 0.5);
          vec3 A = uBoneA[bi];
          vec3 B = uBoneB[bi];
          vec3 axis = B - A;
          vec2 axis2 = axis.xy;
          float len = max(length(axis2), 1e-4);
          vec2 perp = vec2(-axis2.y, axis2.x) / len;

          vec3 p = A + axis * aTUJ.x;
          p.xy += perp * aTUJ.y;
          p.z += aTUJ.z;

          // hair hangs, whatever the head is doing
          p.y -= aHair * uHairDroop * (1.0 - aTUJ.x);

          float rank = clamp(p.y / uHeight, 0.0, 1.0);
          float tau = 6.2831853;
          float seed = float(bi) * 3.7 + aTUJ.y * 41.0;

          p.x += sin(uTime * uDriftSpd + seed) * uDrift * (0.3 + rank);
          p.y += cos(uTime * uDriftSpd * 0.83 + seed * 1.3) * uDrift * 0.5;
          p.y -= uSag * pow(rank, 1.7) * 0.8;
          p.x += sin(uTime * 27.0 + seed) * uTremble * (0.2 + rank);
          p.y += cos(uTime * 31.0 + seed) * uTremble * 0.7;

          vPress = aPress;
          vHair = aHair;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uBone, uHairInk;
        varying float vPress;
        varying float vHair;
        void main() {
          float a = vPress * uOpacity;
          if (a < 0.004) discard;
          // hair is the one dark mass on him
          vec3 col = mix(uBone, uHairInk, vHair);
          gl_FragColor = vec4(col, a * mix(1.0, 1.45, vHair));
        }
      `
    });

    this.scribble = new THREE.LineSegments(geo, this.scribbleMat);
    this.scribble.frustumCulled = false;
    this.scribble.position.copy(this.body.position);
    this.scene.add(this.scribble);
  }

  // ── the heart that is not yours ──────────────────────
  _buildHeart() {
    const h = this.cfg.heart;
    const geo = new THREE.IcosahedronGeometry(1.0, 5);

    this.heartMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0 },
        uBeat:     { value: 0 },
        uRadius:   { value: h.radius },
        uDisplace: { value: h.displace },
        uRun:      { value: h.run },
        uWet:      { value: h.wet },
        uBlood:    { value: new THREE.Color(this.cfg.palette.blood) },
        uDark:     { value: new THREE.Color(this.cfg.palette.bloodDark) },
        uOpacity:  { value: 0 }
      },
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime, uBeat, uRadius, uDisplace;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vLump;
        ${NOISE}

        void main() {
          vec3 n = normalize(position);
          float y = n.y;
          float ang = atan(n.z, n.x);

          // ── the organ, not a ball ──
          // a cone of muscle: broad at the base where the vessels enter,
          // pinched to the apex it hangs from
          float r = mix(0.30, 1.0, smoothstep(-1.0, 0.10, y));
          r *= 1.0 - 0.22 * smoothstep(0.45, 1.0, y);

          // the two ventricles push the front out
          r += 0.14 * smoothstep(-0.55, 0.62, y) * max(cos(ang * 2.0), 0.0);

          // and the sulcus runs down between them
          float groove = exp(-pow((ang - 1.35) / 0.30, 2.0))
                       + exp(-pow((ang - 1.35 + 6.2832) / 0.30, 2.0));
          r -= 0.12 * groove * smoothstep(-0.85, 0.5, y);

          // the auricles: two blunt ears at the base
          float ear = exp(-pow((y - 0.70) / 0.20, 2.0));
          r += 0.17 * ear * max(cos(ang * 2.0 + 1.25), 0.0);

          // muscle wall, never smooth
          float lump = fbm(n * 9.0 + uTime * 0.18);
          r += (lump - 0.5) * uDisplace;
          vLump = lump;

          // systole squeezes it shorter and fatter
          r *= 1.0 + uBeat * 0.055;

          vec3 p = n * r;
          p.y *= 1.30 - uBeat * 0.09;
          p *= uRadius;

          vLocal = p;
          vN = normalize(normalMatrix * normalize(n / vec3(1.0, 1.30, 1.0)));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime, uBeat, uRun, uWet, uOpacity;
        uniform vec3 uBlood, uDark;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vLump;
        ${NOISE}

        void main() {
          vec3 n = normalize(vN);
          vec3 v = normalize(vView);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);

          // blood running down the outside of it
          vec3 q = vLocal * 7.0;
          q.y += uTime * 0.35;
          float runnel = fbm(vec3(q.x * 2.4, q.y * 0.5, q.z * 2.4));
          runnel = smoothstep(0.42, 0.72, runnel);

          vec3 col = mix(uDark, uBlood, 0.35 + vLump * 0.5);
          col = mix(col, uBlood * 1.35, runnel * uRun);
          col += uBlood * fres * 0.55;
          col *= 0.75 + uBeat * 0.45;

          // wet: a tight highlight that slides as it beats
          vec3 lightDir = normalize(vec3(0.35, 0.85, 0.4));
          float spec = pow(max(dot(reflect(-v, n), lightDir), 0.0), 34.0);
          col += vec3(1.0, 0.86, 0.82) * spec * uWet;

          gl_FragColor = vec4(col, uOpacity);
        }
      `
    });

    this.heart = new THREE.Mesh(geo, this.heartMat);
    this.heart.position.set(0, 1.2, -9.0);
    this.heart.rotation.z = 0.24;
    this.scene.add(this.heart);

    this._buildDrips();
    this._buildTether();
  }

  // ── it leaks the whole time ──────────────────────────
  _buildDrips() {
    const d = this.cfg.drips;
    const seed = new Float32Array(d.count * 4);
    const pos = new Float32Array(d.count * 3);
    for (let i = 0; i < d.count; i++) {
      const i4 = i * 4;
      seed[i4] = Math.random();
      seed[i4 + 1] = Math.random();
      seed[i4 + 2] = Math.random();
      seed[i4 + 3] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));

    this.dripMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime:    { value: 0 },
        uOrigin:  { value: new THREE.Vector3() },
        uRate:    { value: d.rate },
        uSpread:  { value: d.spread },
        uSize:    { value: d.pointSize },
        uOpacity: { value: 0 },
        uDPR:     { value: 1 },
        uBlood:   { value: new THREE.Color(this.cfg.palette.blood) }
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uRate, uSpread, uSize, uDPR;
        uniform vec3 uOrigin;
        varying float vA;
        void main() {
          float speed = 0.55 + aSeed.x * 0.9;
          float life = fract(uTime * uRate * speed + aSeed.y);

          vec3 p = uOrigin;
          p.x += (aSeed.x - 0.5) * uSpread;
          p.z += (aSeed.z - 0.5) * uSpread * 0.7;
          p.y -= 0.10 + aSeed.w * 0.08;

          // it gathers, then it falls
          float hang = smoothstep(0.0, 0.28, life);
          float fall = pow(max(life - 0.28, 0.0) / 0.72, 2.0) * (p.y - 0.02);
          p.y -= fall;

          float landed = step(p.y, 0.03);
          p.y = max(p.y, 0.02);

          vA = hang * (1.0 - landed * smoothstep(0.85, 1.0, life));

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uDPR * (7.5 / max(-mv.z, 0.4)), 7.0)
                       * mix(1.0, 1.9, landed);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uBlood;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float a = vA * uOpacity * (1.0 - smoothstep(0.10, 0.25, r2));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uBlood * 1.2, a);
        }
      `
    });

    this.drips = new THREE.Points(geo, this.dripMat);
    this.drips.frustumCulled = false;
    this.scene.add(this.drips);
  }

  _buildTether() {
    this.TETHER_N = 44;
    this.tetherPos = new Float32Array(this.TETHER_N * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tetherPos, 3));
    this.tetherMat = new THREE.LineBasicMaterial({
      color: this.ink, transparent: true, opacity: 0, fog: true, depthWrite: false
    });
    this.tether = new THREE.Line(tg, this.tetherMat);
    this.tether.frustumCulled = false;
    this.scene.add(this.tether);
  }

  // ── arranhava as paredes da minha cabeça ─────────────
  _buildScratches() {
    const s = this.cfg.scratches;
    const c = this.cfg.corridor;
    const pos = [];
    const ord = [];
    const along = [];

    // walls and ceiling both — the head is scratched from every side
    const surfaces = [
      { kind: 'wall', side: -1, w: 0.33 },
      { kind: 'wall', side: 1, w: 0.33 },
      { kind: 'ceil', side: 0, w: 0.34 }
    ];

    const pick = () => {
      let r = Math.random();
      for (const su of surfaces) { if (r < su.w) return su; r -= su.w; }
      return surfaces[0];
    };

    for (let i = 0; i < s.count; i++) {
      const order = i / s.count;
      const su = pick();
      const z0 = lerp(s.zFrom, s.zTo, Math.random());
      const len = lerp(s.lengthMin, s.lengthMax, Math.random());
      const angle = (Math.random() - 0.5) * 1.7;

      let base, dirA, dirB;
      if (su.kind === 'wall') {
        // on a wall: y is "up", z runs down the corridor
        base = { x: su.side * (c.width * 0.5 - 0.025), y: 0.35 + Math.random() * (c.height - 1.1), z: z0 };
        dirA = { x: 0, y: Math.sin(angle) * len, z: Math.cos(angle) * len };
      } else {
        // on the ceiling: x across, z along
        base = { x: (Math.random() - 0.5) * (c.width - 0.6), y: c.height - 0.03, z: z0 };
        dirA = { x: Math.sin(angle) * len * 0.7, y: 0, z: Math.cos(angle) * len };
      }

      let prev = null;
      for (let j = 0; j <= s.segments; j++) {
        const t = j / s.segments;
        const p = [
          base.x + dirA.x * t + (Math.random() - 0.5) * (su.kind === 'wall' ? 0.012 : s.jitter),
          base.y + dirA.y * t + (Math.random() - 0.5) * (su.kind === 'wall' ? s.jitter : 0.012),
          base.z + dirA.z * t + (Math.random() - 0.5) * s.jitter
        ];
        if (prev) {
          pos.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
          ord.push(order, order);
          along.push((j - 1) / s.segments, t);
        }
        prev = p;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aOrder', new THREE.Float32BufferAttribute(ord, 1));
    geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));

    this.scratchMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uReveal:  { value: 0 },
        uOpacity: { value: s.opacity },
        uInk:     { value: this.ink },
        uBlood:   { value: this.blood },
        uBleed:   { value: 0 },
        uTime:    { value: 0 }
      },
      vertexShader: /* glsl */ `
        attribute float aOrder;
        attribute float aAlong;
        uniform float uReveal, uTime;
        varying float vA;
        varying float vFresh;
        void main() {
          // each scratch is carved in turn, and each carves head to tail
          float head = (uReveal * 1.35 - aOrder) * 3.2;
          float cut = smoothstep(0.0, 0.30, head - aAlong);
          float fresh = 1.0 - smoothstep(0.0, 1.2, head - aAlong);
          vA = cut * (0.82 + fresh * 0.55);
          vFresh = fresh;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity, uBleed;
        uniform vec3 uInk, uBlood;
        varying float vA;
        varying float vFresh;
        void main() {
          float a = clamp(vA * uOpacity, 0.0, 1.0);
          if (a < 0.004) discard;
          // a fresh gouge is wet and red; an old one is just a black cut
          vec3 col = mix(uInk, uBlood, clamp(vFresh * uBleed, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `
    });

    this.scratches = new THREE.LineSegments(geo, this.scratchMat);
    this.scratches.frustumCulled = false;
    this.scene.add(this.scratches);
  }

  // ── and the gouges run ───────────────────────────────
  _buildWallBlood() {
    const w = this.cfg.wallBlood;
    const src = this.scratches.geometry.attributes.position.array;
    const ord = this.scratches.geometry.attributes.aOrder.array;
    const n = ord.length;

    const origin = new Float32Array(w.count * 3);
    const seed = new Float32Array(w.count * 3);
    const order = new Float32Array(w.count);

    for (let i = 0; i < w.count; i++) {
      const v = Math.floor(Math.random() * n);
      origin[i * 3] = src[v * 3];
      origin[i * 3 + 1] = src[v * 3 + 1];
      origin[i * 3 + 2] = src[v * 3 + 2];
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
      order[i] = ord[v];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(origin, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));

    this.wallBloodMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime:    { value: 0 },
        uReveal:  { value: 0 },
        uRun:     { value: w.run },
        uSize:    { value: w.pointSize },
        uOpacity: { value: w.opacity },
        uDPR:     { value: 1 },
        uBlood:   { value: new THREE.Color(this.cfg.palette.blood) }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        attribute float aOrder;
        uniform float uTime, uReveal, uRun, uSize, uDPR;
        varying float vA;
        void main() {
          vec3 p = position;

          // a gouge only bleeds once it has been cut
          float cut = smoothstep(aOrder, aOrder + 0.06, uReveal * 1.3);

          // then it runs, slowing as it goes, and never runs back up
          float age = max(uReveal * 1.3 - aOrder, 0.0);
          float run = (1.0 - exp(-age * 3.2)) * uRun * (0.35 + aSeed.x * 1.3);
          p.y -= run;
          p.x += sin(run * 7.0 + aSeed.y * 6.28) * 0.012;

          vA = cut * (0.45 + aSeed.z * 0.55) * (1.0 - smoothstep(0.7, 1.0, run / max(uRun, 0.001)));

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uDPR * (7.5 / max(-mv.z, 0.4)), 6.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uBlood;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float a = vA * uOpacity * (1.0 - smoothstep(0.09, 0.25, r2));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uBlood * 1.25, a);
        }
      `
    });

    this.wallBlood = new THREE.Points(geo, this.wallBloodMat);
    this.wallBlood.frustumCulled = false;
    this.scene.add(this.wallBlood);
  }

  // ── o rastro de terra, de brita, de chão ─────────────
  _buildGravel() {
    const g = this.cfg.gravel;
    const pos = new Float32Array(g.count * 3);
    const seed = new Float32Array(g.count * 3);

    for (let i = 0; i < g.count; i++) {
      const t = i / g.count;
      const i3 = i * 3;
      pos[i3]     = (Math.random() - 0.5) * g.spread * (0.4 + t);
      pos[i3 + 1] = Math.random() * 0.16;
      pos[i3 + 2] = lerp(g.zFrom, g.zTo, t) + (Math.random() - 0.5) * 0.6;
      seed[i3]     = Math.random();
      seed[i3 + 1] = Math.random();
      seed[i3 + 2] = t;                 // position in the trail
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

    this.gravelMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime:    { value: 0 },
        uReveal:  { value: 0 },
        uSize:    { value: g.pointSize },
        uFall:    { value: g.fallSpeed },
        uOpacity: { value: g.opacity },
        uDPR:     { value: 1 },
        uInk:     { value: this.ink }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uReveal, uSize, uFall, uDPR;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = aSeed.z;

          // grains still in the air, tumbling down to the pile
          float life = fract(uTime * uFall * (0.5 + aSeed.x * 0.8) + aSeed.y);
          // only a few kicked-up grains, and they never leave the floor by much
          float airborne = step(aSeed.x, 0.10);
          p.y += airborne * (1.0 - life) * (0.10 + aSeed.y * 0.22);
          p.x += airborne * sin(life * 9.0 + aSeed.y * 6.28) * 0.05;

          float shown = smoothstep(t - 0.05, t + 0.02, uReveal) * smoothstep(0.0, 0.06, uReveal);
          vA = shown * (0.4 + aSeed.y * 0.6);

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uDPR * (7.5 / max(-mv.z, 0.4)), 3.5);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uInk;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float a = vA * uOpacity * (1.0 - smoothstep(0.14, 0.25, r2));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uInk, a);
        }
      `
    });

    this.gravel = new THREE.Points(geo, this.gravelMat);
    this.scene.add(this.gravel);
  }

  // ── the scrape the dragging leaves in the floor ──────
  _buildDragMarks() {
    const g = this.cfg.gravel;
    const pos = [];
    const ord = [];
    const along = [];
    const N = 46;
    const SEG = 20;

    for (let i = 0; i < N; i++) {
      const order = i / N;
      const z0 = lerp(g.zFrom, g.zTo, Math.random());
      const x0 = (Math.random() - 0.5) * g.spread * 1.1;
      const len = 0.8 + Math.random() * 2.6;
      let prev = null;
      for (let j = 0; j <= SEG; j++) {
        const t = j / SEG;
        const p = [
          x0 + (Math.random() - 0.5) * 0.04 + Math.sin(t * 3.0 + i) * 0.06,
          0.012 + Math.random() * 0.01,
          z0 - len * t
        ];
        if (prev) {
          pos.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
          ord.push(order, order);
          along.push((j - 1) / SEG, t);
        }
        prev = p;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aOrder', new THREE.Float32BufferAttribute(ord, 1));
    geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));

    this.dragMat = this.scratchMat.clone();
    this.dragMat.uniforms.uOpacity.value = 0.42;
    this.dragMat.uniforms.uReveal.value = 0;
    this.dragMarks = new THREE.LineSegments(geo, this.dragMat);
    this.dragMarks.frustumCulled = false;
    this.scene.add(this.dragMarks);
  }

  // ── the poem, standing in the room ───────────────────
  async loadCharacter() {
    await Promise.all([this.cutout.load(), this.double.load()]);
  }

  async buildText(onProgress) {
    const t = this.cfg.text;
    this.textGroups.length = 0;
    const total = this.poem.beats.reduce((n, b) => n + b.lines.length, 0);
    let done = 0;

    for (const beat of this.poem.beats) {
      const group = new THREE.Group();
      group.position.set(beat.x, beat.y !== undefined ? beat.y : 1.5, 0);
      group.userData.frozenZ = null;
      const meshes = [];

      // the plate wiped clean behind the words — an etcher's trick, and the only
      // reason ink lettering stays readable over dense crosshatch
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uPaper:   { value: new THREE.Color(0x8a8a8a) },
            uOpacity: { value: 0 }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            precision highp float;
            uniform vec3 uPaper;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
              vec2 d = (vUv - 0.5) * 2.0;
              float r = length(vec2(d.x * 0.72, d.y));
              float a = (1.0 - smoothstep(0.05, 0.85, r)) * uOpacity;
              if (a < 0.004) discard;
              gl_FragColor = vec4(uPaper, a);
            }
          `
        })
      );
      halo.position.z = -0.06;
      halo.renderOrder = -1;
      group.add(halo);

      beat.lines.forEach((line, i) => {
        const txt = new Text();
        txt.text = line;
        txt.font = '/fonts/InstrumentSerif-Regular.ttf';
        txt.fontSize = t.fontSize;
        txt.maxWidth = t.maxWidth;
        txt.lineHeight = t.lineHeight;
        txt.letterSpacing = t.letterSpacing;
        txt.anchorX = beat.anchor;
        txt.anchorY = 'middle';
        txt.color = this.cfg.palette.bone;
        txt.fillOpacity = 0;
        txt.outlineWidth = 0;
        txt.material.transparent = true;
        txt.material.depthWrite = false;
        txt.position.y = -i * t.fontSize * t.lineHeight;
        txt.userData.index = i;
        group.add(txt);
        meshes.push(txt);
      });

      // centre the block vertically on its anchor point
      const h = (beat.lines.length - 1) * t.fontSize * t.lineHeight;
      group.position.y += h * 0.5;

      const longest = beat.lines.reduce((n, l) => Math.max(n, l.length), 0);
      const wGuess = Math.min(longest * t.fontSize * 0.46, t.maxWidth);
      halo.scale.set((wGuess + 1.4) * t.haloScale, (h + 1.2) * t.haloScale, 1);
      halo.position.x = (beat.anchor === 'right' ? -0.5 : 0.5) * wGuess;
      halo.position.y = -h * 0.5;

      await Promise.all(meshes.map((m) => new Promise((res) => {
        m.sync(() => { done++; onProgress?.(done / total); res(); });
      })));

      this.scene.add(group);
      this.textGroups.push({ beat, group, meshes, halo });
    }
  }

  resize(w, h, dpr) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bodyMat.uniforms.uDPR.value = dpr;
    this.gravelMat.uniforms.uDPR.value = dpr;
    this.dripMat.uniforms.uDPR.value = dpr;
    this.wallBloodMat.uniforms.uDPR.value = dpr;
  }

  setMouse(x, y) { this.mouse.set(x, y); }

  /** camera z for a playhead position — stations with a dwell at each */
  _cameraZ(t) {
    const st = this.cfg.camera.stations;
    const beats = this.cfg.beats;
    let i = beats.findIndex((b) => t < b.to);
    if (i === -1) i = beats.length - 1;
    return lerp(st[i], st[i + 1], smoothstep(0, 1, beatProgress(t, beats[i])));
  }

  /**
   * @param {number} t    playhead 0→1
   * @param {number} time seconds since the piece began
   */
  update(t, time, dt) {
    const C = this.cfg;
    const cam = this.camera;

    // ── camera ──────────────────────────────────────────
    const zTarget = this._cameraZ(t);
    const yTarget = lerp(C.camera.yStart, C.camera.yEnd, smoothstep(0.70, 1, t));
    const wob = C.camera.wobbleAmp;
    const ws = C.camera.wobbleSpeed;

    this.mouseSmooth.lerp(this.mouse, 0.045);
    const px = this.mouseSmooth.x * C.camera.mouseParallax;
    const py = this.mouseSmooth.y * C.camera.mouseParallax * 0.4;

    const xTarget = Math.sin(time * ws) * wob + Math.sin(time * ws * 2.3) * wob * 0.4 + px;
    cam.position.x += (xTarget - cam.position.x) * C.camera.lerp;
    cam.position.y += (yTarget + Math.cos(time * ws * 1.31) * wob * 0.7 + py - cam.position.y) * C.camera.lerp;
    cam.position.z += (zTarget - cam.position.z) * C.camera.lerp;

    const camZ = cam.position.z;
    cam.lookAt(
      Math.sin(time * ws * 0.7) * 0.12 + px * 0.5,
      lerp(1.5, 0.72, smoothstep(0.62, 1, t)),
      camZ - C.camera.lookAhead
    );

    // ── the wall, and the lamp that travels with you ────
    const lucid = smoothstep(0.46, 0.60, t) * (1 - smoothstep(0.76, 0.90, t));
    this.plaster.uniforms.uTime.value = time;
    this.plaster.uniforms.uLucid.value = lucid;
    this.plaster.uniforms.uHead.value.set(cam.position.x, cam.position.y, camZ - 3.0);

    // ── the body walks ahead of you the whole way ───────
    // you never overtake it. you follow your own body down the corridor.
    const lead = t < 0.45
      ? lerp(C.body.leadFar, C.body.leadNear, smoothstep(0.0, 0.45, t))
      : lerp(C.body.leadNear, C.body.leadHaul, smoothstep(0.45, 1.0, t));
    this.body.position.set(C.body.x + Math.sin(time * 0.21) * 0.03, 0, camZ - lead);

    // ── and from here it is hauling ─────────────────────
    const haul = smoothstep(C.body.haulFrom, C.body.haulTo, t);
    // one heave per step, and the steps get slower as the weight tells
    const stepRate = lerp(0.80, 0.34, haul);
    const heave = Math.sin(time * stepRate * Math.PI * 2.0);
    // the pull is not smooth: it lurches, catches, and drags
    const lurch = Math.sign(heave) * Math.pow(Math.abs(heave), 0.55);

    this.joints = poseJoints(haul, lurch, this.joints);
    boneEndpoints(this.joints, C.body.height, this.boneA, this.boneB);

    this.bodyMat.uniforms.uTime.value = time;
    this.bodyMat.uniforms.uOpacity.value = smoothstep(0.03, 0.17, t) * C.body.opacity;
    this.bodyMat.uniforms.uSag.value = smoothstep(0.26, 0.58, t) * C.body.sagMax * (1.0 - haul * 0.6);
    this.bodyMat.uniforms.uTremble.value =
      haul * C.body.trembleMax * (0.45 + 0.55 * Math.abs(heave));

    // ── the drawing walks ───────────────────────────────
    if (this.cutout.loaded) {
      const C2 = C.cutout;
      this.cutout.root.position.set(this.body.position.x, 0, this.body.position.z);
      // he only strides while there is corridor left to cross
      // he does not walk. he is carried along, which is not the same thing.
      const unrest = smoothstep(0.05, 0.22, t);
      this.cutout.pose(time, unrest, haul);
      this.cutout.setOpacity(smoothstep(0.03, 0.17, t) * C2.opacity);

      // lit by the same lamp as the walls
      const dx = this.cutout.root.position.x - cam.position.x;
      const dz = this.cutout.root.position.z - (camZ - 3.0);
      const dy = 1.2 - cam.position.y;
      const dd = dx * dx + dy * dy + dz * dz;
      const lit = 0.10 + Math.exp(-dd * C.corridor.lampFalloff) *
        (C.corridor.lampBase + lucid * C.corridor.lampLucid) * 2.2;
      this.cutout.setLight(lit);

      // ── the intruder ──
      // it trails the body it belongs to and never quite catches up
      const D = C.double;
      this._lag.lerp(this.cutout.root.position, D.lag);
      this.double.root.position.set(
        this._lag.x + D.offsetX,
        this._lag.y,
        this._lag.z + D.offsetZ
      );
      this.double.pose(time - 1.7, unrest, haul * 0.6);
      const near = 1 - smoothstep(D.from, D.to, t);
      this.double.setOpacity(smoothstep(0.03, 0.17, t) * D.opacity * near);
      this.double.setLight(lit * 0.85);
    }

    // the charcoal rides the same bones
    this.scribble.position.copy(this.body.position);
    const su = this.scribbleMat.uniforms;
    su.uTime.value = time;
    su.uOpacity.value = smoothstep(0.03, 0.17, t) * C.scribble.opacity;
    su.uSag.value = this.bodyMat.uniforms.uSag.value;
    su.uTremble.value = this.bodyMat.uniforms.uTremble.value;

    // where the figure's own joints are, in the room
    const W = C.body.height * 0.62;
    const jw = (name, out) => {
      const j = this.joints[name];
      return out.set(this.body.position.x + j[0] * W, j[1] * C.body.height, this.body.position.z);
    };
    this._v1 = this._v1 || new THREE.Vector3();
    this._v2 = this._v2 || new THREE.Vector3();
    this._v3 = this._v3 || new THREE.Vector3();
    const chest = jw('sternum', this._v1);
    const shoulder = jw('shoulderR', this._v2);

    // ── the heart, on a rhythm that is not yours ────────
    const bps = C.heart.bpm / 60;
    const phase = (time * bps + C.heart.desync) % 1;
    const beat =
      Math.exp(-Math.pow(phase * 9.0, 2)) +
      0.62 * Math.exp(-Math.pow((phase - 0.19) * 11.0, 2)) +
      Math.exp(-Math.pow((phase - 1.0) * 9.0, 2));

    const heartIn = smoothstep(0.19, 0.33, t);
    this.heartMat.uniforms.uTime.value = time;
    this.heartMat.uniforms.uBeat.value = beat;
    this.heartMat.uniforms.uOpacity.value = heartIn;

    // it leaves the chest, goes over the shoulder, and ends up on his back —
    // low enough that it drags. "uma bolsa de carne nas costas."
    const onBack = smoothstep(C.heart.backFrom, C.heart.backTo, t);
    // seen from behind, his back is the only place it can be read, so it rides
    // there the whole way and sinks lower as it gets heavier
    if (this.cutout.loaded) {
      this.cutout.shoulderWorld(this._v3);
      this._v3.x += C.heart.standOffX;
      this._v3.z += C.heart.standOffZ;
    } else {
      this._v3.set(chest.x + 0.05, chest.y + 0.04, chest.z + 0.30);
    }
    const anchorX = this.cutout.loaded ? this.cutout.root.position.x : this.body.position.x;
    const anchorZ = this.cutout.loaded ? this.cutout.root.position.z : this.body.position.z;
    const dragX = anchorX + C.heart.dragOffsetX;
    const dragY = C.heart.backY + Math.abs(heave) * 0.045;
    const dragZ = anchorZ + C.heart.dragBehind;
    this.heart.position.set(
      lerp(this._v3.x, dragX, onBack) + Math.sin(time * 0.4) * 0.03,
      lerp(this._v3.y, dragY, onBack) + beat * 0.012,
      lerp(this._v3.z, dragZ, onBack)
    );
    this.heart.rotation.y = time * 0.09;
    this.heart.rotation.z = 0.24 + onBack * 0.7 + Math.sin(time * 0.7) * 0.06 * onBack;

    // and it leaks wherever it is
    this.dripMat.uniforms.uTime.value = time;
    this.dripMat.uniforms.uOrigin.value.copy(this.heart.position);
    this.dripMat.uniforms.uOpacity.value = heartIn * this.cfg.drips.opacity;

    // ── the strap: chest thread first, then a line over the shoulder ────
    const anchor = this._v1.set(
      lerp(chest.x, shoulder.x, onBack),
      lerp(chest.y, shoulder.y, onBack),
      lerp(chest.z + 0.22, shoulder.z, onBack)
    );
    // slack while it hangs, near-straight once he is really pulling
    const sagAmt = lerp(0.16, 0.05, onBack);
    for (let i = 0; i < this.TETHER_N; i++) {
      const k = i / (this.TETHER_N - 1);
      const i3 = i * 3;
      this.tetherPos[i3]     = lerp(anchor.x, this.heart.position.x, k)
                             + Math.sin(time * 0.8 + k * 5.0) * 0.02 * (1 - Math.abs(0.5 - k) * 2);
      this.tetherPos[i3 + 1] = lerp(anchor.y, this.heart.position.y, k) - Math.sin(k * Math.PI) * sagAmt;
      this.tetherPos[i3 + 2] = lerp(anchor.z, this.heart.position.z, k);
    }
    this.tether.geometry.attributes.position.needsUpdate = true;
    this.tetherMat.opacity = heartIn * 0.55;

    // ── arranhava as paredes da minha cabeça ────────────
    const cut = smoothstep(0.44, 0.78, t);
    // the bleeding starts a moment after the cut, and does not stop
    const bleed = smoothstep(0.50, 0.72, t);
    this.scratchMat.uniforms.uTime.value = time;
    this.scratchMat.uniforms.uReveal.value = cut;
    this.scratchMat.uniforms.uBleed.value = bleed;
    this.wallBloodMat.uniforms.uTime.value = time;
    this.wallBloodMat.uniforms.uReveal.value = cut;

    // the wall itself opens: the gouges widen and start to run
    this.plaster.uniforms.uBleed.value = bleed;
    this.plaster.uniforms.uCrackBite.value =
      C.corridor.crackBite * (1 + cut * C.corridor.crackBiteGain);

    // ── o rastro de terra, de brita, de chão ────────────
    this.gravelMat.uniforms.uTime.value = time;
    const trail = smoothstep(0.68, 1.0, t);
    this.gravelMat.uniforms.uReveal.value = trail;
    this.dragMat.uniforms.uReveal.value = trail;

    // ── the stanzas hold reading distance, then are passed ──
    const T = C.text;
    for (let i = 0; i < this.textGroups.length; i++) {
      const { beat: b, group, meshes, halo } = this.textGroups[i];
      const local = beatProgress(t, C.beats[i]);
      const env = envelope(local, T.fadeIn, T.fadeOut);
      const arriving = smoothstep(0, T.fadeIn, local);
      const leaving = smoothstep(1 - T.fadeOut, 1, local);

      if (leaving <= 0.001) {
        // it drifts in from the dark and settles at reading distance
        group.position.z = camZ - T.readDistance - T.approach * (1 - arriving);
        group.userData.frozenZ = null;
      } else {
        // then it stops, and you go through it
        if (group.userData.frozenZ === null) group.userData.frozenZ = group.position.z;
        group.position.z = group.userData.frozenZ;
      }
      group.position.x = b.x + Math.sin(time * 0.31 + i) * 0.012;

      halo.material.uniforms.uOpacity.value = env * T.haloOpacity;
      for (const m of meshes) {
        const stagger = m.userData.index * 0.07;
        const a = Math.max(0, Math.min(1, (env - stagger) / (1 - stagger || 1)));
        m.fillOpacity = a * 0.94;
        m.visible = a > 0.004;
      }
    }

    return {
      lucid,
      beat,
      tremor: smoothstep(0.46, 0.58, t) * (1 - smoothstep(0.66, 0.78, t))
    };
  }
}
