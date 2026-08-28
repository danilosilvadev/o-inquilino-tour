import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { beatProgress, envelope, smoothstep, lerp } from '../core/Scrubber.js';
import { NOISE } from '../core/etch.js';
import { CutoutFigure } from '../core/CutoutFigure.js';
import figureBack from '../config/figure-back.json';

/**
 * PartScene — one part of O Inquilino.
 *
 * There is one room and one body for the whole poem. What changes between
 * parts is what the room does to him, chosen from a small grammar of moves
 * (see tools/build-parts.py). Nothing illustrates the text: the figure never
 * performs, and there are no props standing in for images in the writing.
 */
export class PartScene {
  constructor(cfg, part) {
    this.cfg = cfg;
    this.part = part;
    this.moves = part.moves || {};

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(cfg.palette.void);
    this.scene.fog = new THREE.Fog(cfg.palette.void, cfg.fog.near, cfg.fog.far);

    this.bone = new THREE.Color(cfg.palette.bone);
    this.camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, cfg.camera.near, cfg.camera.far);
    this.camera.position.set(0, cfg.camera.yStart, part.stations[0]);

    this.mouse = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    this.textGroups = [];

    this._buildRoom();
    this._buildSwarm();
    this._buildFigures();
  }

  m(name) { return this.moves[name] || 0; }

  // ── the room ─────────────────────────────────────────
  _buildRoom() {
    const c = this.cfg.corridor;
    this.plaster = new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0 },
        uBone:   { value: new THREE.Color(this.cfg.palette.bone) },
        uHead:   { value: new THREE.Vector3(0, 1.5, 0) },
        uLamp:   { value: c.lampBase },
        uFalloff:{ value: c.lampFalloff },
        uStain:  { value: c.stainScale },
        uCrack:  { value: c.crackScale },
        uCrackBite:  { value: c.crackBite },
        uCrackPatch: { value: c.crackPatch },
        uDamp:   { value: c.damp },
        uDrip:   { value: c.drip },
        uCold:   { value: 0 }
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime, uLamp, uFalloff, uStain, uCrack, uCrackBite,
                      uCrackPatch, uDamp, uDrip, uCold;
        uniform vec3 uBone, uHead;
        varying vec3 vWorld;
        ${NOISE}
        void main() {
          vec3 p = vWorld;

          vec3 sp = p * uStain;
          sp.y -= fbm(p * 0.7) * uDrip;
          float stain = smoothstep(0.28, 0.78, fbm(sp));

          // a wall does not craze evenly: one field makes the lines, a slower
          // one decides where the wall is broken at all
          float ridge = abs(fbm(p * uCrack) - 0.5) * 2.0;
          float crack = 1.0 - smoothstep(0.0, uCrackBite, ridge);
          crack *= smoothstep(uCrackPatch, uCrackPatch + 0.16, fbm(p * 0.42 + 13.0));

          float tooth = fbm(p * 26.0) * 0.16;
          float lum = 0.030 + stain * 0.10 * uDamp + tooth * 0.35 - crack * 0.06;

          float d = length(p - uHead);
          float flicker = 0.86 + 0.14 * fbm(vec3(uTime * 2.3, 0.0, 0.0));
          lum += exp(-d * d * uFalloff) * uLamp * flicker;

          vec3 col = uBone * lum;
          col = mix(col, col * vec3(0.86, 0.9, 1.05), 0.55);
          // cold: the light thins out and goes blue
          col = mix(col, col * vec3(0.62, 0.78, 1.18) * 0.85, uCold);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const c2 = this.cfg.corridor;
    this.room = new THREE.Group();
    const L = c2.length;
    const zMid = -L * 0.5 + 6;
    const mk = (geo, rot, pos) => {
      const m = new THREE.Mesh(geo, this.plaster);
      if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, 0);
      m.position.set(...pos);
      this.room.add(m);
      return m;
    };
    this.floor = mk(new THREE.PlaneGeometry(c2.width, L), [-Math.PI / 2, 0], [0, 0, zMid]);
    this.ceil  = mk(new THREE.PlaneGeometry(c2.width, L), [Math.PI / 2, 0], [0, c2.height, zMid]);
    this.wallL = mk(new THREE.PlaneGeometry(L, c2.height), [0, -Math.PI / 2], [-c2.width / 2, c2.height / 2, zMid]);
    this.wallR = mk(new THREE.PlaneGeometry(L, c2.height), [0, Math.PI / 2], [c2.width / 2, c2.height / 2, zMid]);
    this.end   = mk(new THREE.PlaneGeometry(c2.width, c2.height), null, [0, c2.height / 2, zMid - L / 2]);
    this.scene.add(this.room);
  }

  // ── grain moving in the dark ─────────────────────────
  _buildSwarm() {
    const s = this.cfg.swarm;
    const pos = new Float32Array(s.count * 3);
    const seed = new Float32Array(s.count * 3);
    for (let i = 0; i < s.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.cfg.corridor.width;
      pos[i * 3 + 1] = Math.random() * this.cfg.corridor.height;
      pos[i * 3 + 2] = -Math.random() * this.cfg.corridor.length;
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

    this.swarmMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uAmount: { value: 0 },
        uSize: { value: s.pointSize }, uDPR: { value: 1 },
        uBone: { value: this.bone }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uAmount, uSize, uDPR;
        varying float vA;
        void main() {
          vec3 p = position;
          float tau = 6.2831853;
          p.x += sin(uTime * 0.21 + aSeed.x * tau) * 0.35;
          p.y += cos(uTime * 0.17 + aSeed.y * tau) * 0.25
               + sin(uTime * 0.06 + aSeed.z * tau) * 0.6;
          p.z += sin(uTime * 0.13 + aSeed.z * tau) * 0.4;
          vA = (0.25 + aSeed.y * 0.75) * uAmount;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uSize * uDPR * (7.5 / max(-mv.z, 0.4)), 4.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uBone;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25 || vA < 0.004) discard;
          float a = (1.0 - smoothstep(0.02, 0.25, r)) * vA;
          gl_FragColor = vec4(uBone * a, a);
        }
      `
    });
    this.swarm = new THREE.Points(geo, this.swarmMat);
    this.swarm.frustumCulled = false;
    this.scene.add(this.swarm);
  }

  // ── the body, and the ones that trail it ─────────────
  _buildFigures() {
    const n = 1 + Math.round(this.cfg.figure.maxTrail *
      Math.max(this.m('afterimage'), this.m('double') > 0 ? 0.34 : 0));
    this.figures = [];
    this.lagPos = [];
    for (let i = 0; i < n; i++) {
      const f = new CutoutFigure(figureBack, this.cfg.cutout, this.cfg.palette);
      if (i > 0) f.root.scale.setScalar(1 + i * 0.02);
      this.scene.add(f.root);
      this.figures.push(f);
      this.lagPos.push(new THREE.Vector3());
    }
    this.figure = this.figures[0];
  }

  async loadCharacter() {
    await Promise.all(this.figures.map((f) => f.load()));
  }

  // ── the words ────────────────────────────────────────
  async buildText(onProgress) {
    const T = this.cfg.text;
    const total = this.part.beats.reduce((n, b) => n + b.lines.length, 0);
    let done = 0;

    for (const beat of this.part.beats) {
      const group = new THREE.Group();
      group.position.set(beat.x, beat.y, 0);
      const meshes = [];

      beat.lines.forEach((line, i) => {
        const txt = new Text();
        txt.text = line;
        txt.font = '/fonts/InstrumentSerif-Regular.ttf';
        txt.fontSize = T.fontSize;
        txt.maxWidth = T.maxWidth;
        txt.lineHeight = T.lineHeight;
        txt.letterSpacing = T.letterSpacing;
        txt.anchorX = beat.anchor;
        txt.anchorY = 'middle';
        txt.color = this.cfg.palette.bone;
        txt.fillOpacity = 0;
        txt.material.transparent = true;
        txt.material.depthWrite = false;
        txt.position.y = -i * T.fontSize * T.lineHeight;
        txt.userData.index = i;
        group.add(txt);
        meshes.push(txt);
      });

      const h = (beat.lines.length - 1) * T.fontSize * T.lineHeight;
      group.position.y += h * 0.5;

      await Promise.all(meshes.map((m) => new Promise((res) => {
        m.sync(() => { done++; onProgress?.(done / total); res(); });
      })));

      this.scene.add(group);
      this.textGroups.push({ beat, group, meshes });
    }
  }

  resize(w, h, dpr) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.swarmMat.uniforms.uDPR.value = dpr;
  }

  setMouse(x, y) { this.mouse.set(x, y); }

  _cameraZ(t) {
    const st = this.part.stations;
    const beats = this.part.beats;
    let i = beats.findIndex((b) => t < b.to);
    if (i === -1) i = beats.length - 1;
    return lerp(st[i], st[i + 1], smoothstep(0, 1, beatProgress(t, beats[i])));
  }

  dispose() {
    for (const f of this.figures) f.dispose();
    for (const { group, meshes } of this.textGroups) {
      for (const m of meshes) m.dispose();
      this.scene.remove(group);
    }
    this.textGroups.length = 0;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
  }

  update(t, time, dt) {
    const C = this.cfg;
    const cam = this.camera;

    // ── the moves, all of them ramping through the part ──
    const rise = smoothstep(0.0, 0.75, t);
    const press = this.m('press') * rise;
    const tilt = this.m('tilt') * rise;
    const sink = this.m('sink') * rise;
    const cold = this.m('cold') * smoothstep(0.05, 0.6, t);
    const swarm = this.m('swarm') * smoothstep(0.02, 0.5, t);
    const stretch = this.m('stretch') * rise;
    const erase = this.m('erase') * smoothstep(0.35, 1.0, t);
    const trail = this.m('afterimage') * rise;
    const dbl = this.m('double');

    // a beat that is not his: everything in the room answers it except him
    const bps = C.pulse.bpm / 60;
    const phase = (time * bps + C.pulse.desync) % 1;
    const beat =
      Math.exp(-Math.pow(phase * 9.0, 2)) +
      0.62 * Math.exp(-Math.pow((phase - 0.19) * 11.0, 2)) +
      Math.exp(-Math.pow((phase - 1.0) * 9.0, 2));
    const pulse = this.m('pulse') * beat;

    // ── camera ──
    this._zMul = 1 + stretch * C.moves.stretchZ;
    const zTarget = this._cameraZ(t) * this._zMul;
    const yTarget = lerp(C.camera.yStart, C.camera.yEnd, smoothstep(0.5, 1, t))
                  - sink * C.moves.sinkY;
    const ws = C.camera.wobbleSpeed;
    const wob = C.camera.wobbleAmp;
    this.mouseSmooth.lerp(this.mouse, 0.045);
    const px = this.mouseSmooth.x * C.camera.mouseParallax;
    const py = this.mouseSmooth.y * C.camera.mouseParallax * 0.4;

    cam.position.x += (Math.sin(time * ws) * wob + px - cam.position.x) * C.camera.lerp;
    cam.position.y += (yTarget + Math.cos(time * ws * 1.31) * wob * 0.7 + py - cam.position.y) * C.camera.lerp;
    cam.position.z += (zTarget - cam.position.z) * C.camera.lerp;
    const camZ = cam.position.z;

    cam.up.set(Math.sin(tilt * C.moves.tiltMax + Math.sin(time * 0.3) * tilt * 0.05), 1, 0).normalize();
    cam.lookAt(px * 0.5, lerp(1.5, 0.8, smoothstep(0.6, 1, t)) - sink * C.moves.sinkY, camZ - C.camera.lookAhead);

    // ── the room answers ──
    const w = C.corridor.width * (1 - press * C.moves.pressIn);
    const hh = C.corridor.height * (1 - press * C.moves.pressIn * 0.6);
    this.room.scale.set(w / C.corridor.width, hh / C.corridor.height, 1 + stretch * C.moves.stretchRoom);
    this.room.scale.multiplyScalar(1 + pulse * C.moves.pulseRoom);

    this.plaster.uniforms.uTime.value = time;
    this.plaster.uniforms.uCold.value = cold;
    this.plaster.uniforms.uLamp.value =
      C.corridor.lampBase * (1 - cold * 0.35) * (1 + pulse * C.moves.pulseLamp);
    this.plaster.uniforms.uHead.value.set(cam.position.x, cam.position.y, camZ - 3.0);

    this.swarmMat.uniforms.uTime.value = time;
    this.swarmMat.uniforms.uAmount.value = swarm * C.swarm.amount;

    // ── the body, and the ones a moment behind it ──
    const lead = lerp(C.figure.leadFar, C.figure.leadNear, smoothstep(0, 0.7, t));

    // he stands opposite whichever side the words are on, so the two never
    // fight for the middle of the frame
    let bi = this.part.beats.findIndex((b) => t < b.to);
    if (bi === -1) bi = this.part.beats.length - 1;
    const wantX = this.part.beats[bi].x < -1 ? C.figure.xRight : C.figure.xLeft;
    if (this._figX === undefined) this._figX = wantX;
    this._figX += (wantX - this._figX) * C.figure.sideLerp;
    const homeX = this._figX;
    const homeZ = camZ - lead;
    const unrest = smoothstep(0.05, 0.22, t);
    const shown = smoothstep(0.03, 0.17, t);

    const dx = homeX - cam.position.x;
    const dz = homeZ - (camZ - 3.0);
    const dy = 1.2 - cam.position.y;
    const lit = C.figure.ambient + Math.exp(-(dx * dx + dy * dy + dz * dz) * C.corridor.lampFalloff)
                     * C.corridor.lampBase * 2.2 * (1 - cold * 0.3);

    for (let i = 0; i < this.figures.length; i++) {
      const f = this.figures[i];
      if (!f.loaded) continue;
      if (i === 0) {
        f.root.position.set(homeX, 0, homeZ);
        f.pose(time, unrest, sink * 0.6);
        // erase: the lucidity does not light him, it takes him off the paper
        f.setOpacity(shown * C.cutout.opacity * (1 - erase * C.moves.eraseMax));
        f.setLight(lit);
        this.lagPos[0].set(homeX, 0, homeZ);
      } else {
        // each one lags a little further behind the one in front
        const k = C.figure.lagBase / (1 + i * 0.7);
        this.lagPos[i].lerp(this.lagPos[i - 1], k);
        const fade = (i === 1 ? Math.max(dbl, trail) : trail) * Math.pow(C.figure.trailFade, i - 1);
        f.root.position.set(
          this.lagPos[i].x + (i === 1 ? C.figure.doubleOffsetX : 0),
          this.lagPos[i].y,
          this.lagPos[i].z + i * C.figure.trailGapZ
        );
        f.pose(time - i * 1.7, unrest, sink * 0.4);
        f.setOpacity(shown * fade * C.figure.trailOpacity);
        f.setLight(lit * 0.85);
      }
    }

    // ── the words ──
    const T = C.text;
    for (let i = 0; i < this.textGroups.length; i++) {
      const { beat: b, group, meshes } = this.textGroups[i];
      const local = beatProgress(t, this.part.beats[i]);
      const env = envelope(local, T.fadeIn, T.fadeOut);
      const arriving = smoothstep(0, T.fadeIn, local);
      const leaving = smoothstep(1 - T.fadeOut, 1, local);

      if (leaving <= 0.001) {
        group.position.z = camZ - T.readDistance - T.approach * (1 - arriving);
      } else {
        // Where it stops has to be a function of the timeline, not of where
        // the camera happened to be when we got here. Freezing at the live
        // camera position meant a fast scrub stranded stanzas right in front
        // of the reader at the wrong scale.
        const bt = this.part.beats[i];
        const leaveT = bt.from + (1 - T.fadeOut) * (bt.to - bt.from);
        group.position.z = this._cameraZ(leaveT) * this._zMul - T.readDistance;
      }
      group.position.x = b.x + Math.sin(time * 0.31 + i) * 0.012;

      for (const m of meshes) {
        const stagger = m.userData.index * 0.06;
        const a = Math.max(0, Math.min(1, (env - stagger) / (1 - stagger || 1)));
        m.fillOpacity = a * 0.94;
        m.visible = a > 0.004;
      }
    }

    return { pulse: beat, cold, erase, tremor: tilt * 0.004 + pulse * 0.002 };
  }
}
