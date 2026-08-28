import * as THREE from 'three';
import base from './config/base.json';
import parts from './poem/parts.json';
import { PartScene } from './scenes/PartScene.js';
import { Scrubber, smoothstep } from './core/Scrubber.js';
import { buildComposer } from './core/Post.js';
import { Heartbeat } from './core/Heartbeat.js';
import { Score } from './core/Score.js';

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $('gl'), gate: $('gate'), gateReply: $('gateReply'),
  loader: $('loader'), loaderFill: $('loaderFill'), chrome: $('chrome'),
  railFill: $('railFill'), railCaption: $('railCaption'), railTicks: $('railTicks'),
  hudPart: $('hudPart'), hudCanto: $('hudCanto'), hint: $('hint'),
  soundBtn: $('soundBtn'), soundLabel: $('soundLabel')
};

// ── which part are we reading? ────────────────────────
const params = new URLSearchParams(location.search);
const wanted = params.get('part') || 'I-1';
let part = parts.find((p) => p.id === wanted) || parts[0];
document.title = `O Inquilino — ${part.canto} ${part.mark}`;

const state = { entered: false, irisT: 0, hintGone: false, beatIndex: -1, running: false };

const renderer = new THREE.WebGLRenderer({
  canvas: els.canvas, antialias: false, powerPreference: 'high-performance',
  // the contact sheet reads the buffer back, which needs it kept
  preserveDrawingBuffer: params.has('capture')
});
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

let partIndex = parts.indexOf(part);
let scene = new PartScene(base, part);
const { composer, film, renderPass } = buildComposer(renderer, scene.scene, scene.camera, base.post);
const scrubber = new Scrubber(base.scrub);
const heart = new Heartbeat(base.audio);
let score = null;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  scene.resize(w, h, DPR);
  film.uniforms.uRes.value.set(w * DPR, h * DPR);
}
window.addEventListener('resize', resize);
window.addEventListener('pointermove', (e) => {
  scene.setMouse((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
});

// ── the threshold ─────────────────────────────────────
const REPLIES = { sim: 'mentira. mas entra.', nao: 'nem eu. entra assim mesmo.' };
els.gate.querySelectorAll('.gate-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.entered) return;
    state.entered = true;
    els.gateReply.textContent = REPLIES[btn.dataset.answer];
    els.gateReply.classList.add('show');
    heart.start();
    if (heart.ctx) {
      score = new Score(heart.ctx, heart.master, { part: part.id, gain: base.score.gain });
    }
    setTimeout(enterLoading, 1250);
  });
});

function enterLoading() {
  els.gate.classList.add('out');
  setTimeout(() => { els.gate.classList.add('hidden'); els.loader.classList.remove('hidden'); load(); }, 900);
}

async function load() {
  let shown = 0;
  const setPct = (p) => { shown = Math.max(shown, p); els.loaderFill.style.width = `${Math.round(shown * 100)}%`; };
  setPct(0.05);

  await scene.buildText((p) => setPct(0.05 + p * 0.35));
  try { await scene.loadCharacter(); } catch (e) { console.warn('[o inquilino] character art:', e.message); }
  setPct(0.55);

  if (score) {
    try { await score.load((p) => setPct(0.55 + p * 0.15)); }
    catch (e) { console.warn('[o inquilino] score:', e.message); score = null; }
  }

  setPct(0.9);

  scene.update(0, 0, 0.016);
  composer.render();
  setPct(1);
  setTimeout(begin, 500);
}

function begin() {
  els.loader.classList.add('out');
  setTimeout(() => { els.loader.classList.add('hidden'); els.chrome.classList.remove('hidden'); }, 900);
  paintHud();
  clock.start();
  state.running = true;
  score?.start();
}

els.soundBtn.addEventListener('click', () => {
  const muted = heart.toggle();
  score?.setMuted(muted);
  els.soundBtn.classList.toggle('muted', muted);
  els.soundLabel.textContent = muted ? 'SOM OFF' : 'SOM ON';
});

// ── one poem, twenty-four rooms ──────────────────────
// The parts hand over to each other rather than being separate pages: the
// audio context survives, so the Adagio keeps running through its slices the
// way it was cut to.
let swapping = false;

async function goToPart(index, { atEnd = false } = {}) {
  if (swapping || index < 0 || index >= parts.length) return;
  swapping = true;
  state.running = false;

  // close the eye
  await fadeTo(0, 900);

  const old = scene;
  part = parts[index];
  partIndex = index;
  scene = new PartScene(base, part);
  renderPass.scene = scene.scene;
  renderPass.camera = scene.camera;
  resize();

  await scene.buildText();
  try { await scene.loadCharacter(); } catch (e) { console.warn('[o inquilino] character art:', e.message); }
  old.dispose();

  if (heart.ctx) {
    score?.stop();
    score = new Score(heart.ctx, heart.master, { part: part.id, gain: base.score.gain });
    try { await score.load(); } catch (e) { console.warn('[o inquilino] score:', e.message); score = null; }
  }

  scrubber.target = scrubber.value = atEnd ? 0.999 : 0;
  state.beatIndex = -1;
  scene.update(scrubber.value, clock.getElapsedTime(), 0.016);
  paintHud();

  history.replaceState(null, '', `?part=${part.id}${params.has('debug') ? '&debug' : ''}`);
  state.running = true;
  score?.start();


  await fadeTo(1, 1100);
  swapping = false;
}

function fadeTo(target, ms) {
  // deliberately not rAF: a hidden tab suspends it outright, and a handover
  // that never finishes leaves the reader on a black screen for good
  return new Promise((res) => {
    const from = film.uniforms.uFade.value;
    const t0 = performance.now();
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      film.uniforms.uFade.value = from + (target - from) * k;
      if (k >= 1) { clearInterval(id); res(); }
    }, 16);
  });
}

function paintHud() {
  els.hudCanto.textContent = part.canto.toUpperCase();
  els.hudPart.textContent = part.mark;
  els.railTicks.innerHTML = '<i id="railFill"></i>' + part.beats
    .map((b) => `<b class="rail-tick" style="--at:${b.from}"></b>`).join('');
  els.railFill = document.getElementById('railFill');
}

const clock = new THREE.Clock(false);
let last = 0;

function frame() {
  requestAnimationFrame(frame);
  const time = clock.getElapsedTime();
  const dt = Math.min(time - last, 0.05);
  last = time;
  step(time, dt);
}

// one frame's worth of work, separated from the scheduling so it can be
// driven by hand — a hidden tab suspends rAF entirely, which makes the loop
// untestable otherwise
function step(time, dt) {
  const t = scrubber.update();
  const out = scene.update(t, time, dt);

  state.irisT = Math.min(1, state.irisT + dt / (base.post.irisDuration * 18));
  const u = film.uniforms;
  u.uTime.value = time;
  u.uIris.value = state.running ? smoothstep(0, 1, state.irisT) : 0;
  u.uTremor.value = out.tremor + Math.abs(scrubber.velocity) * 0.02;
  u.uFlash.value = out.pulse * 0.02 + out.erase * 0.05;

  heart.setIntensity(t);

  els.railFill.style.width = `${(t * 100).toFixed(1)}%`;
  let bi = part.beats.findIndex((b) => t >= b.from && t < b.to);
  if (bi === -1) bi = part.beats.length - 1;
  if (bi !== state.beatIndex) {
    state.beatIndex = bi;
    els.railCaption.textContent = `${bi + 1} / ${part.beats.length}`;
  }
  if (!state.hintGone && t > 0.02) { state.hintGone = true; els.hint.classList.add('gone'); }

  // the end of a part is a door, not a wall
  if (state.running && !swapping) {
    if (t > 0.998 && scrubber.target >= 0.999 && partIndex < parts.length - 1) goToPart(partIndex + 1);
    else if (t < 0.002 && scrubber.target <= 0.001 && partIndex > 0) goToPart(partIndex - 1, { atEnd: true });
  }

  composer.render();
}

resize();
frame();

// the sweep needs a door it can walk through without a hand
if (params.has('auto')) {
  state.entered = true;
  els.gate.classList.add('hidden');
  els.loader.classList.remove('hidden');
  load();
}

if (params.has('debug')) {
  Object.defineProperty(window, 'SCENE', { get: () => scene });
  Object.defineProperty(window, 'PART', { get: () => part });
  window.SCRUB = scrubber; window.FILM = film; window.GOTO = goToPart;
  window.STATE = state;
  window.TICK = (n = 1, dt = 0.016) => {
    for (let i = 0; i < n; i++) { last += dt; step(last, dt); }
    return scrubber.value;
  };
  Object.defineProperty(window, 'SWAPPING', { get: () => swapping });
  Object.defineProperty(window, 'PIDX', { get: () => partIndex });
  window.JUMP = (v) => {
    scrubber.target = v; scrubber.value = v; state.irisT = 1;
    const now = clock.getElapsedTime();
    for (let i = 0; i < 220; i++) scene.update(v, now, 0.016);
    composer.render();
    return v;
  };
  console.log(`[o inquilino] ${part.id} — ${part.beats.length} beats, moves:`, part.moves);
}
