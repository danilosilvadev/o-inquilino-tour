import parts from './poem/parts.json';
import base from './config/base.json';
import { Stage } from './stage/Stage.js';
import { Scrubber } from './core/Scrubber.js';
import { Bed } from './core/Bed.js';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), gate: $('gate'), gateReply: $('gateReply'),
  chrome: $('chrome'), rail: $('rail'), railFill: $('railFill'),
  hint: $('hint'), playBtn: $('playBtn'), playLabel: $('playLabel'),
  interlude: $('interlude'), interludeName: $('interludeName'),
  soundBtn: $('soundBtn'), soundLabel: $('soundLabel'), rotate: $('rotate'),
  end: $('end'), endLinks: $('endLinks'),
  intro: $('intro'), titleSpace: $('titleSpace'), titleLens: $('titleLens')
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
let index = Math.max(0, parts.findIndex((p) => p.id === (params.get('part') || 'I-1')));
let part = parts[index];
let stage = new Stage(els.stage, part);
const firstPlate = stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));

const scrub = new Scrubber({ wheelScale: 0.00009, touchScale: 0.0011, keyStep: 0.02, ease: 0.07 });
let ctx = null, master = null, bed = null;
let running = false, swapping = false, muted = false, playing = false, done = false;
let lastT = performance.now() / 1000;
let t0 = performance.now();

document.title = `O Inquilino — ${part.canto} ${part.mark}`;
if (params.get('font')) document.body.dataset.font = params.get('font');

// ── the threshold ─────────────────────────────────────
const REPLIES = { sim: 'mentira. mas entra.', nao: 'nem eu. entra assim mesmo.' };
els.gate.querySelectorAll('.gate-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (running || swapping) return;
    els.gateReply.textContent = REPLIES[b.dataset.answer];
    els.gateReply.classList.add('show');
    startAudio();
    immerse();
    setTimeout(enter, 1200);
  });
});

// a phone held upright wastes the plate. Ask the browser for the whole screen
// and for landscape; both are refused on iOS, where the CSS prompt takes over.
const handheld = matchMedia('(hover: none) and (pointer: coarse)').matches;
async function immerse() {
  if (!handheld) return;
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
  catch (e) { /* refused or already there */ }
  try { await screen.orientation.lock('landscape'); }
  catch (e) { /* unsupported on iOS Safari — .rotate asks instead */ }
}

els.rotate.addEventListener('click', async () => {
  await immerse();
  await wait(450);
  if (matchMedia('(orientation: portrait)').matches) document.body.dataset.portrait = 'ok';
  stage.resize();
});

window.addEventListener('orientationchange', () => setTimeout(() => stage.resize(), 300));

function startAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || ctx) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
}

// The title is given a body: the same words stacked backwards in depth, the
// front face lit and each one behind it dimmer, so flying the stack past the
// reader carries them through the letters instead of at them.
function buildTitle() {
  if (els.titleSpace.childElementCount) return;
  const LAYERS = 18;
  for (let i = 0; i < LAYERS; i++) {
    const d = document.createElement('div');
    d.className = 'title-layer';
    d.textContent = 'O Inquilino';
    d.style.transform = i ? `translate(-50%, -50%) translateZ(${-i * 13}px)` : '';
    d.style.opacity = (1 - (i / LAYERS) * 0.94).toFixed(3);
    els.titleSpace.appendChild(d);
  }
}

/** wait, unless the reader would rather get on with it */
function holdFor(ms) {
  return new Promise((res) => {
    const done = () => { clearTimeout(id); off(); res(); };
    const id = setTimeout(done, ms);
    const off = () => { for (const e of SKIPS) window.removeEventListener(e, done); };
    for (const e of SKIPS) window.addEventListener(e, done, { once: true, passive: true });
  });
}
const SKIPS = ['wheel', 'touchstart', 'keydown', 'click'];

async function intro() {
  buildTitle();
  els.intro.classList.remove('hidden');
  await wait(60);                       // let it paint before the animation starts
  els.titleSpace.classList.add('run');
  els.titleLens.classList.add('run');
  await holdFor(8200);
  els.intro.classList.add('out');
  await wait(1200);
  els.intro.classList.add('hidden');

  // and then the canto, in the same hand as every other canto in the poem
  els.interlude.classList.add('on');
  await wait(700);
  els.interludeName.textContent = part.canto;
  els.interlude.classList.add('name');
  await holdFor(3400);
  els.interlude.classList.remove('name');
  await wait(1800);
  els.interlude.classList.remove('on');
  await wait(1600);
}

async function enter() {
  els.gate.classList.add('out');
  setTimeout(() => els.gate.classList.add('hidden'), 900);
  // the music starts under the title, and the first plate loads behind it
  loadBed();
  if (!params.has('still') && !params.has('part')) await intro();
  paintHud();
  els.chrome.classList.remove('hidden');
  document.body.classList.add('in');
  running = true;
  // the plate is ~1.6MB; on a phone it may not be here yet, and starting the
  // playhead over a blank screen would spend the opening stanzas on nothing
  els.hint.textContent = 'carregando';
  await firstPlate;
  els.hint.textContent = 'role para atravessar';
  if (!params.has('still')) setPlaying(true);
}

// The poem changes register at Canto V, where the other person arrives, and
// the music changes with it. Parts hand over underneath whichever is playing.
const BEDS = { early: 'audio/bed.mp3', late: 'audio/bed-2.mp3' };
const bedFor = (p) => (['Canto V', 'Canto VI'].includes(p.canto) ? 'late' : 'early');

async function loadBed() {
  if (!ctx || bed) return;
  bed = new Bed(ctx, master, { gain: 0.5, loopFade: 5, switchFade: 7 });
  const first = bedFor(part);
  bed.setMuted(muted);
  bed.switchTo(first);          // recorded now, heard once the buffer lands
  try {
    await bed.load(first, BEDS[first]);
  } catch (e) {
    console.warn('[o inquilino] music:', e.message);
    bed = null;
    return;
  }
  // the second piece is not wanted before Canto V — fetch it behind the poem
  const other = first === 'early' ? 'late' : 'early';
  bed.load(other, BEDS[other]).catch((e) => console.warn('[o inquilino] music:', e.message));
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
  const crossing = parts[i] && parts[i].canto !== part.canto;

  // burn it back down rather than fading it out; a canto takes longer to go
  await stage.unform(crossing ? 4200 : 2800);

  if (crossing) {
    els.interlude.classList.add('on');
    await wait(900);
    els.interludeName.textContent = parts[i].canto;
    els.interlude.classList.add('name');
    await wait(3600);
    els.interlude.classList.remove('name');
    await wait(2200);
  }

  stage.dispose();
  part = parts[i]; index = i;
  stage = new Stage(els.stage, part);
  await stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));
  document.title = `O Inquilino — ${part.canto} ${part.mark}`;

  scrub.target = scrub.value = atEnd ? 0.999 : 0;
  scrub.clearIntent();
  stage.update(scrub.value, (performance.now() - t0) / 1000);
  paintHud();
  history.replaceState(null, '', `?part=${part.id}`);

  if (crossing) {
    els.interlude.classList.remove('on');
    await wait(1600);
  }

  bed?.switchTo(bedFor(part));
  running = true;
  swapping = false;
  lastT = performance.now() / 1000;
}

// ── cinema ────────────────────────────────────────────
// Playing paces the part by its own slice of the Adagio, so the picture is
// finished exactly as the music for it runs out.
// The music is one continuous bed now, so nothing outside the poem sets the
// pace. A part is held for as long as its own text takes to read: more words,
// more time on screen. Beat windows are already weighted by paragraph length,
// so the long stanzas inside a part get the larger share of it too.
// worked out per beat when the parts were built, with a floor under every
// stanza so a short line still gets its moment
function partSeconds() {
  return part.seconds || 20;
}

async function finish() {
  if (done) return;
  done = true;
  setPlaying(false);
  running = false;
  bed?.fadeOut(12);
  await stage.unform(5200);
  els.chrome.classList.add('hidden');
  els.end.classList.remove('hidden');
  els.end.classList.add('out');
  els.end.offsetHeight;          // commit the transparent state before easing in
  els.end.classList.remove('out');
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
  bed?.setMuted(muted);
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
      else finish();
    }
  }

  const t = scrub.update();
  stage.update(t, time);

  if (els.railFill) els.railFill.style.width = `${(t * 100).toFixed(1)}%`;
  if (!hintGone && t > 0.02) { hintGone = true; els.hint.classList.add('gone'); }

  if (running && !swapping) {
    if (scrub.wantsNext() && index >= parts.length - 1) finish();
    else if (scrub.wantsNext()) goTo(index + 1);
    else if (scrub.wantsPrev() && index > 0) goTo(index - 1, { atEnd: true });
  }
}

const LINKS = [['instagram', 'Instagram'], ['youtube', 'YouTube']];
for (const [key, label] of LINKS) {
  const href = (base.links || {})[key];
  if (!href) continue;                 // no link is better than a wrong one
  const a = document.createElement('a');
  a.href = href; a.textContent = label;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  els.endLinks.appendChild(a);
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
  Object.defineProperty(window, 'BED', { get: () => bed });
  Object.defineProperty(window, 'CTX', { get: () => ctx });
  window.FINISH = finish;
  Object.defineProperty(window, 'DONE', { get: () => done });
  window.TICK = (n = 1) => { for (let i = 0; i < n; i++) step((performance.now() - t0) / 1000); return scrub.value; };
  console.log(`[o inquilino] ${part.id} — ${part.canto}, ${part.beats.length} beats`);
}
