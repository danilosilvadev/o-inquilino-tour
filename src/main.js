import parts from './poem/parts.json';
import { Stage } from './stage/Stage.js';
import { Scrubber } from './core/Scrubber.js';
import { Score } from './core/Score.js';
import scoreMap from './config/score-map.json';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), gate: $('gate'), gateReply: $('gateReply'),
  chrome: $('chrome'), rail: $('rail'), railFill: $('railFill'),
  hint: $('hint'), playBtn: $('playBtn'), playLabel: $('playLabel'),
  soundBtn: $('soundBtn'), soundLabel: $('soundLabel')
};

const params = new URLSearchParams(location.search);
let index = Math.max(0, parts.findIndex((p) => p.id === (params.get('part') || 'I-1')));
let part = parts[index];
let stage = new Stage(els.stage, part);
stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));

const scrub = new Scrubber({ wheelScale: 0.00009, touchScale: 0.0011, keyStep: 0.02, ease: 0.07 });
let ctx = null, master = null, score = null;
let running = false, swapping = false, muted = false, playing = false;
let lastT = performance.now() / 1000;
let t0 = performance.now();

document.title = `O Inquilino — ${part.canto} ${part.mark}`;

// ── the threshold ─────────────────────────────────────
const REPLIES = { sim: 'mentira. mas entra.', nao: 'nem eu. entra assim mesmo.' };
els.gate.querySelectorAll('.gate-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (running || swapping) return;
    els.gateReply.textContent = REPLIES[b.dataset.answer];
    els.gateReply.classList.add('show');
    startAudio();
    setTimeout(enter, 1200);
  });
});

function startAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || ctx) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
}

async function enter() {
  els.gate.classList.add('out');
  setTimeout(() => els.gate.classList.add('hidden'), 900);
  await loadScore();
  paintHud();
  els.chrome.classList.remove('hidden');
  document.body.classList.add('in');
  running = true;
  score?.start();
}

async function loadScore() {
  if (!ctx) return;
  score = new Score(ctx, master, { part: part.id, gain: 0.55 });
  try { await score.load(); } catch (e) { console.warn('[o inquilino] score:', e.message); score = null; }
  score?.setMuted(muted);
}

function paintHud() {
  // no canto/part label here: every plate has its own, stitched into it
  els.rail.innerHTML = '<i id="railFill"></i>' +
    part.beats.map((b) => `<b style="--at:${b.from}"></b>`).join('');
  els.railFill = $('railFill');
}

// ── one poem, six places ──────────────────────────────
async function goTo(i, { atEnd = false } = {}) {
  if (swapping || i < 0 || i >= parts.length) return;
  swapping = true; running = false;
  // burn it back down rather than fading it out
  await stage.unform(850);

  stage.dispose();
  part = parts[i]; index = i;
  stage = new Stage(els.stage, part);
  await stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));
  document.title = `O Inquilino — ${part.canto} ${part.mark}`;

  score?.stop();
  await loadScore();

  scrub.target = scrub.value = atEnd ? 0.999 : 0;
  scrub.clearIntent();
  stage.update(scrub.value, (performance.now() - t0) / 1000);
  paintHud();
  history.replaceState(null, '', `?part=${part.id}`);

  running = true;
  score?.start();
  swapping = false;
  lastT = performance.now() / 1000;
}

// ── cinema ────────────────────────────────────────────
// Playing paces the part by its own slice of the Adagio, so the picture is
// finished exactly as the music for it runs out.
function partSeconds() {
  const e = scoreMap.find((m) => m.id === part.id);
  return e ? e.duration : 22;
}

function setPlaying(v) {
  playing = v;
  els.playBtn.classList.toggle('on', v);
  els.playLabel.textContent = v ? 'PAUSAR' : 'TOCAR';
}

els.playBtn.addEventListener('click', () => setPlaying(!playing));
// any hand on the wheel takes it back
for (const ev of ['wheel', 'touchstart', 'keydown']) {
  window.addEventListener(ev, () => { if (playing) setPlaying(false); }, { passive: true });
}

els.soundBtn.addEventListener('click', () => {
  muted = !muted;
  score?.setMuted(muted);
  els.soundBtn.classList.toggle('muted', muted);
  els.soundLabel.textContent = muted ? 'SOM OFF' : 'SOM ON';
});

// ── the loop ──────────────────────────────────────────
let hintGone = false;

function step(time) {
  const dt = Math.min(time - lastT, 0.05);
  lastT = time;

  if (playing && running && !swapping) {
    scrub.target = Math.min(1, scrub.target + dt / partSeconds());
    if (scrub.target >= 1 && scrub.value > 0.995) {
      if (index < parts.length - 1) goTo(index + 1);
      else setPlaying(false);
    }
  }

  const t = scrub.update();
  stage.update(t, time);

  if (els.railFill) els.railFill.style.width = `${(t * 100).toFixed(1)}%`;
  if (!hintGone && t > 0.02) { hintGone = true; els.hint.classList.add('gone'); }

  if (running && !swapping) {
    if (scrub.wantsNext() && index < parts.length - 1) goTo(index + 1);
    else if (scrub.wantsPrev() && index > 0) goTo(index - 1, { atEnd: true });
  }
}

window.addEventListener('resize', () => stage.resize());

function frame() {
  requestAnimationFrame(frame);
  step((performance.now() - t0) / 1000);
}
frame();

if (params.has('auto')) {
  els.gate.classList.add('hidden');
  enter();
}

if (params.has('debug')) {
  Object.defineProperty(window, 'STAGE', { get: () => stage });
  Object.defineProperty(window, 'PART', { get: () => part });
  window.SCRUB = scrub;
  window.GOTO = goTo;
  window.READY = () => running;
  Object.defineProperty(window, 'PLAYING', { get: () => playing });
  Object.defineProperty(window, 'SCORE', { get: () => score });
  Object.defineProperty(window, 'CTX', { get: () => ctx });
  window.TICK = (n = 1) => { for (let i = 0; i < n; i++) step((performance.now() - t0) / 1000); return scrub.value; };
  console.log(`[o inquilino] ${part.id} — ${part.canto}, ${part.beats.length} beats`);
}
