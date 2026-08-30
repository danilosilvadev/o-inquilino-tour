import { Charcoal } from './Charcoal.js';
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
const FALLBACK = 'art/seated.png';

export class Stage {
  constructor(root, part) {
    this.part = part;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plate';
    root.appendChild(this.canvas);



    this.words = document.createElement('div');
    this.words.className = 'words';
    root.appendChild(this.words);

    this.blocks = part.beats.map((beat, i) => {
      const b = document.createElement('div');
      b.className = 'stanza' + (i % 2 ? ' right' : '');
      b.innerHTML = beat.lines
        .map((l) => `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`)
        .join('');
      this.words.appendChild(b);
      return b;
    });
  }

  async load() {
    const entry = art[this.part.id] || {};
    // thread art is full-bleed and already light-on-dark; ink drawings are
    // dark-on-paper and have to be turned over to read on this ground
    const thread = entry.medium === 'thread';
    this.charcoal = new Charcoal(this.canvas, {
      strokes: thread ? 14000 : 6000,
      invert: !thread,
      fit: entry.fit || (thread ? 'cover' : 'contain')
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
    if (!this.charcoal) return;
    this.charcoal.resize(window.innerWidth, window.innerHeight);
  }

  update(t, time = 0) {
    if (!this.charcoal) return;
    // the drawing is mostly there by the last stanza, so the part ends on a
    // finished picture rather than on one still being made
    this.charcoal.setProgress(smoothstep(0.02, 0.78, t), time);

    for (let i = 0; i < this.blocks.length; i++) {
      const local = beatProgress(t, this.part.beats[i]);
      // the words clear off the end of the part, so it finishes on the
      // finished picture rather than on a picture with writing over it
      const clear = 1 - smoothstep(0.86, 0.99, t);
      const a = envelope(local, 0.14, 0.18) * clear;
      const b = this.blocks[i];
      b.style.opacity = a.toFixed(3);
      b.style.transform = `translateY(${((1 - a) * 14).toFixed(2)}px)`;
      b.style.visibility = a > 0.004 ? 'visible' : 'hidden';
    }
  }

  dispose() {
    this.canvas.remove();
    this.words.remove();
  }
}
