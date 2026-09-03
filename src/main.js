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
// the camera drives the clock itself; the live loop would overwrite its frames
let rendering = false;
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
  const LAYERS = 30;
  // Built back to front. The deepest slab is written first and the lit face
  // last, so the order they are painted in and the order they sit in depth
  // agree — with a bright face written first, the dark wall behind it was
  // landing on top and the whole title came out nearly black.
  for (let i = 0; i < LAYERS; i++) {
    const depth = LAYERS - 1 - i;            // 25 at the back, 0 at the face
    const k = depth / (LAYERS - 1);
    const d = document.createElement('div');
    d.className = 'title-layer';
    d.textContent = 'O Inquilino';
    // shallow on purpose: 11px a slab put 275px of depth on the stack, and up
    // close each slab projected at its own scale, so the word came apart into
    // ghosts of itself. A tight wall holds together at any distance.
    d.style.transform = depth ? `translateZ(${-depth * 5}px)` : '';
    // a lit face over a solid grey wall falling into the dark, so the letters
    // read as cut out of something rather than printed on it
    const v = Math.round(236 - 200 * k);
    d.style.color = `rgb(${v}, ${v - 2}, ${Math.round(v * 0.96)})`;
    d.style.opacity = (1 - k * 0.22).toFixed(3);
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
  // wait for the face itself, or the words reflow mid-drift
  await Promise.race([document.fonts.ready, wait(2500)]);
  els.intro.classList.remove('hidden');
  await wait(50);
  els.titleSpace.classList.add('run');
  els.titleLens.classList.add('run');
  await holdFor(20000);

  // the canto comes up behind the title going out, rather than after a stretch
  // of nothing — that gap read as the piece having stalled
  els.intro.classList.add('out');
  els.interlude.classList.add('on');
  await wait(1300);
  els.intro.classList.add('hidden');
  els.interludeName.textContent = part.canto;
  els.interlude.classList.add('name');
  await holdFor(3600);
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
  if (!rendering) step((performance.now() - t0) / 1000);
}
frame();

if (params.has('auto')) {
  els.gate.classList.add('hidden');
  enter();
}

// ── rendering ─────────────────────────────────────────
// Everything the piece does on a timer — the drift, the burn, the title, the
// interludes — is driven off the wall clock, which is right for a reader and
// useless for a camera: a dropped frame is a jump. This hands the clock over,
// so a frame can be asked for at an exact moment and will be identical every
// time it is asked for. Nothing here runs unless ?render is on.
if (params.has('render')) {
  rendering = true;
  els.gate.classList.add('hidden');
  document.body.classList.add('in');
  const veil = (el, a) => {
    el.classList.remove('hidden');
    el.style.transition = 'none';
    el.style.opacity = String(a);
    el.style.pointerEvents = 'none';
  };
  window.RENDER = {
    parts: parts.map((p) => ({ id: p.id, canto: p.canto, mark: p.mark, seconds: p.seconds })),

    /** hide the reading furniture: a video has no scroll rail or play button */
    chrome(on) { els.chrome.classList.toggle('hidden', !on); },

    async part(i) {
      if (stage) stage.dispose();
      part = parts[i]; index = i;
      stage = new Stage(els.stage, part);
      await stage.load().catch((e) => console.warn('[render] art:', e.message));
      paintHud();
      document.title = `O Inquilino — ${part.canto} ${part.mark}`;
      return { id: part.id, canto: part.canto, seconds: part.seconds };
    },

    /** one frame of a part: playhead at t, world clock at time */
    frame(t, time) { stage.update(t, time); this._t = t; },

    /** one frame of the plate burning away, the playhead held where it ended */
    burn(k, time) {
      stage.charcoal?.setErase(k);
      stage.update(this._t ?? 1, time);
    },

    titleBuild() {
      buildTitle();
      els.intro.classList.remove('hidden');
      els.intro.style.transition = 'none';
      els.intro.style.opacity = '1';
      els.titleSpace.classList.add('run');
      els.titleLens.classList.add('run');
      const a = els.titleSpace.getAnimations().find((x) => x.animationName === 'title-approach');
      const b = els.titleLens.getAnimations().find((x) => x.animationName === 'title-focus');
      a.pause(); b.pause();
      this._title = [a, b];
      return a.effect.getTiming().duration;
    },
    titleFrame(ms) { for (const a of this._title) a.currentTime = ms; },
    titleHide() { els.intro.classList.add('hidden'); },

    /** the canto card, driven by hand rather than by its transitions */
    card(name, veilAlpha, nameAlpha) {
      els.interludeName.textContent = name;
      veil(els.interlude, veilAlpha);
      const sp = els.interlude.querySelector('span');
      sp.style.transition = 'none';
      sp.style.opacity = String(nameAlpha * 0.5);
      sp.style.transform = `scale(${(0.985 + 0.015 * nameAlpha).toFixed(4)})`;
    },
    cardHide() { els.interlude.style.opacity = '0'; },

    end(alpha) { veil(els.end, alpha); },
  };
  console.log('[o inquilino] render mode');
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
