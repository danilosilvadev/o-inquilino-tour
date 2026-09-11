import partsPT from './poem/parts.json';
import partsEN from './poem/parts.en.json';
import partsES from './poem/parts.es.json';
import base from './config/base.json';
import { Stage } from './stage/Stage.js';
import { Scrubber } from './core/Scrubber.js';
import { Bed } from './core/Bed.js';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), gate: $('gate'), gateReply: $('gateReply'),
  chrome: $('chrome'), rail: $('rail'), railFill: $('railFill'),
  hint: $('hint'), piece: $('piece'), playBtn: $('playBtn'), playLabel: $('playLabel'),
  interlude: $('interlude'), interludeName: $('interludeName'),
  soundBtn: $('soundBtn'), soundLabel: $('soundLabel'), rotate: $('rotate'),
  end: $('end'), endLinks: $('endLinks'), fim: $('fim'),
  intro: $('intro'), titleSpace: $('titleSpace'), titleLens: $('titleLens'),
  gateAsk: $('gateAsk'), gateLang: $('gateLang'), rotateAsk: $('rotateAsk'), rotateOr: $('rotateOr')
};

// ── the two tongues ───────────────────────────────────
// The poem is Portuguese. The others are second readings of the same
// paragraphs, laid on the same plates with the same moves; only the words and
// the few things the interface says change. The title stays the work's name
// in the tab and on the gate; the one flown past the reader is in their tongue.
const TONGUES = {
  pt: {
    parts: partsPT, title: 'O Inquilino', canto: 'Canto',
    ask: 'Você está<br /><em>em seu corpo?</em>', yes: 'SIM', no: 'NÃO',
    replies: { sim: 'mentira. mas entra.', nao: 'nem eu. entra assim mesmo.' },
    sub: 'um poema atravessado', loading: 'carregando', scroll: 'role para atravessar',
    play: 'TOCAR', pause: 'PAUSAR', soundOn: 'SOM ON', soundOff: 'SOM OFF', end: 'Fim',
    rotate: 'vire o aparelho', rotateOr: 'ou toque para continuar assim',
  },
  en: {
    parts: partsEN, title: 'The Tenant', canto: 'Song',
    ask: 'Are you<br /><em>in your body?</em>', yes: 'YES', no: 'NO',
    replies: { sim: 'liar. but come in.', nao: 'neither am I. come in anyway.' },
    sub: 'a poem to cross', loading: 'loading', scroll: 'scroll to cross',
    play: 'PLAY', pause: 'PAUSE', soundOn: 'SOUND ON', soundOff: 'SOUND OFF', end: 'End',
    rotate: 'turn the device', rotateOr: 'or tap to go on like this',
  },
  es: {
    parts: partsES, title: 'El Inquilino', canto: 'Canto',
    ask: '¿Estás<br /><em>en tu cuerpo?</em>', yes: 'SÍ', no: 'NO',
    replies: { sim: 'mentira. pero entra.', nao: 'yo tampoco. entra igual.' },
    sub: 'un poema atravesado', loading: 'cargando', scroll: 'desliza para atravesar',
    play: 'TOCAR', pause: 'PAUSAR', soundOn: 'SONIDO ON', soundOff: 'SONIDO OFF', end: 'Fin',
    rotate: 'gira el aparato', rotateOr: 'o toca para seguir así',
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
let lang = TONGUES[params.get('lang')] ? params.get('lang') : 'pt';
let T = TONGUES[lang];
let parts = T.parts;
let index = Math.max(0, parts.findIndex((p) => p.id === (params.get('part') || 'I-1')));
let part = parts[index];
let stage = new Stage(els.stage, part);
let firstPlate = stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));

const scrub = new Scrubber({ wheelScale: 0.00009, touchScale: 0.0011, keyStep: 0.02, ease: 0.07 });
let ctx = null, master = null, bed = null;
let running = false, swapping = false, muted = false, playing = false, done = false;
// the camera drives the clock itself; the live loop would overwrite its frames
let rendering = false;
let lastT = performance.now() / 1000;
let t0 = performance.now();

// "Canto I" is the canto's name everywhere in the code — the landscapes and
// the music are keyed on it — and this is only what the reader is shown
const cantoLabel = (p) => p.canto.replace('Canto', T.canto);

document.title = `O Inquilino — ${cantoLabel(part)} ${part.mark}`;
if (params.get('font')) document.body.dataset.font = params.get('font');

// everything the interface says, in the tongue chosen; the poem itself is
// swapped at the gate, before anything has been read
function speak() {
  els.gateAsk.innerHTML = T.ask;
  els.gate.querySelector('[data-answer="sim"]').textContent = T.yes;
  els.gate.querySelector('[data-answer="nao"]').textContent = T.no;
  els.gateLang.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  els.chrome.querySelector('.tl .sub').textContent = T.sub;
  els.playLabel.textContent = playing ? T.pause : T.play;
  els.soundLabel.textContent = muted ? T.soundOff : T.soundOn;
  els.fim.textContent = T.end;
  els.rotateAsk.textContent = T.rotate;
  els.rotateOr.textContent = T.rotateOr;
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
}

function setLang(l) {
  if (!TONGUES[l] || l === lang) return;
  lang = l; T = TONGUES[l]; parts = T.parts;
  part = parts[index];
  // the same plate, the other words on it
  stage.dispose();
  stage = new Stage(els.stage, part);
  firstPlate = stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));
  speak();
  document.title = `O Inquilino — ${cantoLabel(part)} ${part.mark}`;
  history.replaceState(null, '', where());
}

const where = () => `?part=${part.id}${lang === 'pt' ? '' : `&lang=${lang}`}`;

els.gateLang.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lang]');
  if (b && !running && !swapping) setLang(b.dataset.lang);
});
speak();

// ── the threshold ─────────────────────────────────────
els.gate.querySelectorAll('.gate-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (running || swapping) return;
    els.gateReply.textContent = T.replies[b.dataset.answer];
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
    d.textContent = T.title;
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
  els.interludeName.textContent = cantoLabel(part);
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
  els.hint.textContent = T.loading;
  await firstPlate;
  els.hint.textContent = T.scroll;
  if (!params.has('still')) setPlaying(true);
}

// Each canto has its own piece, and the last part of the poem its own again.
// They are recordings of different things at different levels with silence
// either side, so each carries where it really starts and ends and a gain
// that brings it near the others (measured with ffmpeg's ebur128, levelled to
// about -20 LUFS). Parts on the same piece hand over underneath it.
const BEDS = {
  'Canto I':   { file: 'audio/bed.mp3',       start: 0,   end: 476,   gain: 1.0,  name: 'Albinoni — Adagio' },
  'Canto II':  { file: 'audio/lacrimosa.mp3', start: 0,   end: 188,   gain: 0.67, name: 'Mozart — Lacrimosa' },
  'Canto III': { file: 'audio/marais.mp3',    start: 3,   end: 164.5, gain: 0.6,  name: 'Marais — Prélude en harpègement' },
  'Canto IV':  { file: 'audio/serenade.mp3',  start: 4.5, end: 368,   gain: 1.0,  name: 'Schubert — Ständchen' },
  'Canto V':   { file: 'audio/bed-2.mp3',     start: 4,   end: 244,   gain: 1.1,  name: 'Chopin — Noturno' },
  'Canto VI':  { file: 'audio/ave-maria-lobe.mp3', start: 1, end: 156, gain: 0.68, name: 'Javi Lobe — Ave Maria' },
  // the last scene turns to the other Ave Maria, and it stays under Fim
  'VI-3':      { file: 'audio/ave-maria.mp3', start: 0,   end: 190,   gain: 0.73, name: 'Lorenc — Ave Maria' },
};
const bedFor = (p) => BEDS[p.id] || BEDS[p.canto] || BEDS['Canto I'];
const fetchBed = (piece) =>
  bed.load(piece.file, piece).catch((e) => console.warn('[o inquilino] music:', e.message));

async function loadBed() {
  if (!ctx || bed) return;
  bed = new Bed(ctx, master, { gain: 0.5, loopFade: 5, switchFade: 7 });
  // the piece's name sits over the play button, and goes when the piece does
  bed.onPlay = (file) => {
    const piece = Object.values(BEDS).find((b) => b.file === file);
    if (piece) els.piece.textContent = piece.name;
    els.piece.classList.toggle('off', !piece);
  };
  const first = bedFor(part);
  bed.setMuted(muted);
  bed.switchTo(first.file);     // recorded now, heard once the buffer lands
  try {
    await bed.load(first.file, first);
  } catch (e) {
    console.warn('[o inquilino] music:', e.message);
    bed = null;
    return;
  }
  prefetchBeds(index);
}

function crossBed(p) {
  if (!bed) return;
  const piece = bedFor(p);
  bed.switchTo(piece.file);     // heard now if it was prefetched, else once it lands
  fetchBed(piece);
}

// six pieces is too much to pull before the poem can start, and a fast reader
// can cross a canto before one piece lands — so the rest are fetched behind
// the reading, one after another in the order they will be wanted
async function prefetchBeds(i) {
  for (const p of parts.slice(i + 1)) {
    if (!bed) return;
    await fetchBed(bedFor(p));  // a piece already here or on its way is a no-op
  }
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
  const turning = bedFor(parts[i]).file !== bedFor(part).file;

  // burn it back down rather than fading it out; a canto takes longer to go
  await stage.unform(crossing ? 4200 : 2800);

  // the music turns as the picture goes — under the card, when there is one
  if (turning) crossBed(parts[i]);

  if (crossing) {
    els.interlude.classList.add('on');
    await wait(900);
    els.interludeName.textContent = cantoLabel(parts[i]);
    els.interlude.classList.add('name');
    await wait(3600);
    els.interlude.classList.remove('name');
    await wait(2200);
  }

  stage.dispose();
  part = parts[i]; index = i;
  stage = new Stage(els.stage, part);
  await stage.load().catch((e) => console.warn('[o inquilino] art:', e.message));
  document.title = `O Inquilino — ${cantoLabel(part)} ${part.mark}`;

  scrub.target = scrub.value = atEnd ? 0.999 : 0;
  scrub.clearIntent();
  stage.update(scrub.value, (performance.now() - t0) / 1000);
  paintHud();
  history.replaceState(null, '', where());

  if (crossing) {
    els.interlude.classList.remove('on');
    await wait(1600);
  }

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
  // the music is not taken down with the picture: it stays under Fim
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
  els.playLabel.textContent = v ? T.pause : T.play;
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
  els.soundLabel.textContent = muted ? T.soundOff : T.soundOn;
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
