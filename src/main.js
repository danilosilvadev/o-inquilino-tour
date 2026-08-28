import * as THREE from 'three';
import cfg from './config/canto-i-p1.json';
import { CANTO_I_P1 } from './poem/cantoI.js';
import { CantoI_P1 } from './scenes/CantoI_P1.js';
import { Scrubber, smoothstep, lerp } from './core/Scrubber.js';
import { buildComposer } from './core/Post.js';
import { Heartbeat } from './core/Heartbeat.js';
import { Score } from './core/Score.js';
import { Narration } from './core/Narration.js';
import voManifest from './config/vo-I-1.json';

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $('gl'),
  gate: $('gate'),
  gateReply: $('gateReply'),
  loader: $('loader'),
  loaderFill: $('loaderFill'),
  chrome: $('chrome'),
  railFill: $('railFill'),
  railCaption: $('railCaption'),
  hudPart: $('hudPart'),
  hint: $('hint'),
  soundBtn: $('soundBtn'),
  soundLabel: $('soundLabel')
};

const state = {
  entered: false,
  irisT: 0,
  hintGone: false,
  captionIndex: -1
};

// ── renderer ───────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas: els.canvas,
  antialias: false,
  powerPreference: 'high-performance'
});
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new CantoI_P1(cfg, CANTO_I_P1);
const { composer, film } = buildComposer(renderer, scene.scene, scene.camera, cfg.post);
const scrubber = new Scrubber(cfg.scrub);
const heart = new Heartbeat(cfg.audio);
let score = null;
let vo = null;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  scene.resize(w, h, DPR);
  film.uniforms.uRes.value.set(w * DPR, h * DPR);
}
window.addEventListener('resize', resize);

window.addEventListener('pointermove', (e) => {
  scene.setMouse(
    (e.clientX / window.innerWidth) * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1)
  );
});

// ── threshold ──────────────────────────────────────────
const REPLIES = {
  sim: 'mentira. mas entra.',
  nao: 'nem eu. entra assim mesmo.'
};

els.gate.querySelectorAll('.gate-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.entered) return;
    state.entered = true;
    els.gateReply.textContent = REPLIES[btn.dataset.answer];
    els.gateReply.classList.add('show');
    heart.start();                      // the gesture that unlocks audio
    if (heart.ctx) {
      score = new Score(heart.ctx, heart.master, cfg.score);
      vo = new Narration(heart.ctx, heart.master, voManifest, cfg.narration);
    }
    setTimeout(enterLoading, 1250);
  });
});

function enterLoading() {
  els.gate.classList.add('out');
  setTimeout(() => {
    els.gate.classList.add('hidden');
    els.loader.classList.remove('hidden');
    load();
  }, 900);
}

// ── load ───────────────────────────────────────────────
async function load() {
  let shown = 0;
  const setPct = (p) => {
    shown = Math.max(shown, p);
    els.loaderFill.style.width = `${Math.round(shown * 100)}%`;
  };
  setPct(0.06);

  await scene.buildText((p) => setPct(0.06 + p * 0.36));

  // the character's own drawing
  try {
    await scene.loadCharacter();
    setPct(0.48);
  } catch (err) {
    console.warn('[o inquilino] character art unavailable:', err.message);
  }

  // this part's slice of the Adagio
  if (score) {
    try {
      await score.load((p) => setPct(0.52 + p * 0.18));
    } catch (err) {
      console.warn('[o inquilino] score unavailable:', err.message);
      score = null;
    }
  }
  if (vo) {
    try {
      await vo.load((p) => setPct(0.70 + p * 0.16));
    } catch (err) {
      console.warn('[o inquilino] narration unavailable:', err.message);
      vo = null;
    }
  }
  setPct(0.86);

  // one warm-up frame so the first real frame is not a stutter
  scene.update(0, 0, 0.016);
  composer.render();
  setPct(1);

  setTimeout(begin, 620);
}

function begin() {
  els.loader.classList.add('out');
  setTimeout(() => {
    els.loader.classList.add('hidden');
    els.chrome.classList.remove('hidden');
  }, 900);
  els.hudPart.textContent = CANTO_I_P1.part;
  clock.start();
  state.running = true;
  score?.start();
  vo?.speak(0, score?.bus);
}

// ── sound toggle ───────────────────────────────────────
els.soundBtn.addEventListener('click', () => {
  const muted = heart.toggle();
  score?.setMuted(muted);
  vo?.setMuted(muted);
  els.soundBtn.classList.toggle('muted', muted);
  els.soundLabel.textContent = muted ? 'SOM OFF' : 'SOM ON';
});

// ── loop ───────────────────────────────────────────────
const clock = new THREE.Clock(false);
let last = 0;

function frame() {
  requestAnimationFrame(frame);

  const time = clock.getElapsedTime();
  const dt = Math.min(time - last, 0.05);
  last = time;

  const t = scrubber.update();
  const out = scene.update(t, time, dt);

  // iris opens once, on waking
  state.irisT = Math.min(1, state.irisT + dt / (cfg.post.irisDuration * 18));
  const u = film.uniforms;
  u.uTime.value = time;
  u.uIris.value = state.running ? smoothstep(0, 1, state.irisT) : 0;
  u.uTremor.value = out.tremor * cfg.post.tremorMax + Math.abs(scrubber.velocity) * 0.02;
  u.uFlash.value = out.lucid * 0.16 + out.beat * 0.012;
  u.uGrain.value = cfg.post.grain * (1 + out.lucid * 0.5);

  heart.setIntensity(t);

  // hud
  els.railFill.style.width = `${(t * 100).toFixed(1)}%`;
  const bi = cfg.beats.findIndex((b) => t >= b.from && t < b.to);
  const idx = bi === -1 ? cfg.beats.length - 1 : bi;
  if (idx !== state.captionIndex) {
    state.captionIndex = idx;
    els.railCaption.textContent = cfg.beats[idx].caption;
    if (state.running) vo?.speak(idx, score?.bus);

  }
  if (!state.hintGone && t > 0.02) {
    state.hintGone = true;
    els.hint.classList.add('gone');
  }

  composer.render();
}

resize();
frame();

// ── debug: ?debug pins the playhead to the URL hash ────
if (location.search.includes('debug')) {
  window.SCENE = scene;
  window.SCRUB = scrubber;
  window.FILM = film;
  window.STATE = state;
  /** settle the whole rig at a playhead position instantly */
  window.JUMP = (v) => {
    scrubber.target = v;
    scrubber.value = v;
    state.irisT = 1;
    const now = clock.getElapsedTime();
    for (let i = 0; i < 220; i++) scene.update(v, now, 0.016);
    composer.render();
    return v;
  };
  window.addEventListener('keydown', (e) => {
    const n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= cfg.beats.length) {
      scrubber.target = cfg.beats[n - 1].from + 0.01;
    }
  });
  console.log('[o inquilino] debug on — keys 1-4 jump to beats, SCENE/SCRUB exposed');
}
