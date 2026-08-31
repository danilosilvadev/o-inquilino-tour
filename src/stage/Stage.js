import { Charcoal } from './Charcoal.js';

/**
 * A strip that runs opaque -> ragged -> clear. Slid across a stanza it eats
 * the words the way the plate is eaten: an irregular edge with fingers and
 * loose holes ahead of it, rather than a dissolve.
 */
function burnMask(w = 900, h = 340) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  // the edge has to wander far more down the block than across it, or it
  // reads as a clip rather than as something eating the words
  const n = (x, y) =>
    Math.sin(x * 0.012 + y * 0.055) * 0.52 +
    Math.sin(x * 0.031 - y * 0.128) * 0.30 +
    Math.sin(x * 0.085 + y * 0.240) * 0.18;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // the edge sits in the middle third and wanders by about a sixth of it
      const t = (x / w - 0.33) / 0.34;
      const edge = t + n(x, y) * 0.55 + (Math.random() - 0.5) * 0.10;
      let a = 1 - Math.min(1, Math.max(0, edge));
      // embers: a few gaps opening just ahead of the edge
      if (edge > -0.30 && edge < 0.6 && Math.random() < 0.06) a *= 0.12;
      d[(y * w + x) * 4 + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

let MASK = null;
import { beatProgress, envelope, smoothstep } from '../core/Scrubber.js';

/**
 * Stage — one part of the poem.
 *
 * The picture is a finished drawing. The animation is the drawing arriving:
 * charcoal laid down stroke by stroke as the reader moves through the part.
 * Nothing here is generated geometry — the only thing this code decides is the
 * order the strokes appear in.
 */

import art from '../config/art.json';

// every part has its own scene (see tools/build-art.py). Until a part's image
// exists on disk it falls back, so art can land one file at a time instead of
// all twenty-four at once.
const FALLBACK = 'art/seated.webp';

export class Stage {
  constructor(root, part) {
    this.part = part;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plate';
    root.appendChild(this.canvas);



    this.words = document.createElement('div');
    this.words.className = 'words';
    root.appendChild(this.words);

    if (!MASK) MASK = burnMask();

    this.blocks = part.beats.map((beat, i) => {
      const b = document.createElement('div');
      b.className = 'stanza' + (i % 2 ? ' right' : '');
      b.innerHTML = beat.lines
        .map((l) => `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`)
        .join('');
      for (const prop of ['maskImage', 'webkitMaskImage']) b.style[prop] = `url(${MASK})`;
      for (const prop of ['maskSize', 'webkitMaskSize']) b.style[prop] = '300% 100%';
      for (const prop of ['maskRepeat', 'webkitMaskRepeat']) b.style[prop] = 'no-repeat';
      this.words.appendChild(b);
      return b;
    });
  }

  async load() {
    this.fitStanzas();
    const entry = art[this.part.id] || {};
    // thread art is full-bleed and already light-on-dark; ink drawings are
    // dark-on-paper and have to be turned over to read on this ground
    const thread = entry.medium === 'thread';
    const seed = [...this.part.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    this.charcoal = new Charcoal(this.canvas, {
      seed,
      strokes: thread ? 14000 : 6000,
      invert: !thread,
      fit: entry.fit || (thread ? 'cover' : 'contain'),
      // plates 7-9 carry no stitched caption, so nothing needs tearing out
      captionHole: entry.captionHole !== false
    });
    const wanted = entry.file;
    try {
      if (!wanted) throw new Error('no entry');
      await this.charcoal.load(wanted);
      this.usingFallback = false;
    } catch {
      this.charcoal = new Charcoal(this.canvas, { strokes: 6000, invert: true, fit: 'contain' });
      await this.charcoal.load(FALLBACK);
      this.usingFallback = true;
      console.info(`[o inquilino] ${this.part.id}: no scene yet — ${art[this.part.id]?.scene || ''}`);
    }
    this.resize();
  }

  resize() {
    if (this.charcoal) this.charcoal.resize(window.innerWidth, window.innerHeight);
    this.fitStanzas();
  }

  /**
   * Long stanzas were running off the screen. The block is centred vertically,
   * so an overlong one lost lines from the top and the bottom at once — the
   * fifteen-line stanza in Canto IV needs about 680px at full size.
   *
   * Each one is measured and stepped down until it fits the height actually
   * available. Measuring works while the block is hidden, because visibility
   * still leaves it laid out.
   */
  fitStanzas() {
    if (!this.blocks) return;
    const avail = window.innerHeight - this.cfgTextMargin();
    for (const b of this.blocks) {
      b.style.fontSize = '';
      const base = parseFloat(getComputedStyle(b).fontSize);
      let size = base;
      b.style.fontSize = `${size}px`;
      // step down rather than solving in one go: padding and line-height do
      // not scale linearly with the type
      for (let i = 0; i < 24 && b.offsetHeight > avail; i++) {
        size *= 0.94;
        if (size < base * 0.5) break;
        b.style.fontSize = `${size}px`;
      }
      b.dataset.fit = (size / base).toFixed(2);
    }
  }

  cfgTextMargin() {
    // room for the chrome top and bottom
    return Math.max(120, window.innerHeight * 0.16);
  }

  /**
   * Leaving a part runs the same front backwards — the plate is eaten away
   * from its far edge back to where it started, rather than dissolved. Driven
   * on a timer, because a hidden tab suspends rAF and a half-burnt plate that
   * never finishes is worse than one that does.
   */
  unform(ms = 900) {
    if (!this.charcoal) return Promise.resolve();
    const from = this._progress ?? 1;
    const t0 = performance.now();
    return new Promise((res) => {
      const id = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const v = from * (1 - k);
        this._progress = v;
        this.charcoal.setProgress(v, (performance.now() - t0) / 1000);
        if (k >= 1) { clearInterval(id); res(); }
      }, 33);
    });
  }

  update(t, time = 0) {
    if (!this.charcoal) return;
    // the drawing is mostly there by the last stanza, so the part ends on a
    // finished picture rather than on one still being made
    this._progress = smoothstep(0.02, 0.78, t);
    this.charcoal.setProgress(this._progress, time);

    for (let i = 0; i < this.blocks.length; i++) {
      const local = beatProgress(t, this.part.beats[i]);
      // the words clear off the end of the part, so it finishes on the
      // finished picture rather than on a picture with writing over it
      const clear = 1 - smoothstep(0.86, 0.99, t);
      const b = this.blocks[i];

      // arriving is a fade; leaving is a burn, the same as the plate. The mask
      // slides across so the words are eaten from one side with a ragged edge
      // instead of dissolving evenly.
      const arriving = smoothstep(0, 0.14, local);
      const leaving = Math.max(smoothstep(0.82, 1, local), 1 - clear);
      const a = arriving * (leaving < 1 ? 1 : 0);
      const pos = `${(leaving * 100).toFixed(1)}%`;
      b.style.maskPosition = pos;
      b.style.webkitMaskPosition = pos;
      b.style.opacity = (arriving * (1 - smoothstep(0.985, 1, leaving))).toFixed(3);
      // keep the centring: this used to overwrite the -50% from the stylesheet,
      // so every stanza hung down from the middle and the long ones ran off
      // the bottom of the screen
      b.style.transform = `translateY(calc(-50% + ${((1 - a) * 14).toFixed(2)}px))`;
      b.style.visibility = (arriving > 0.004 && leaving < 0.999) ? 'visible' : 'hidden';
    }
  }

  dispose() {
    this.canvas.remove();
    this.words.remove();
  }
}
