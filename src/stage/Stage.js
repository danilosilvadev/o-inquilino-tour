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

// which drawing stands for which canto. one image per canto for now; the
// technique does not care what the picture is.
const ART = {
  'Canto I': 'art/seated.png',
  'Canto II': 'art/seated.png',
  'Canto III': 'art/seated.png',
  'Canto IV': 'art/seated.png',
  'Canto V': 'art/seated.png',
  'Canto VI': 'art/back.png'
};

export class Stage {
  constructor(root, part) {
    this.part = part;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plate';
    root.appendChild(this.canvas);

    this.charcoal = new Charcoal(this.canvas, { strokes: 6000 });

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
    await this.charcoal.load(ART[this.part.canto] || ART['Canto I']);
    this.resize();
  }

  resize() {
    this.charcoal.resize(window.innerWidth, window.innerHeight);
  }

  update(t) {
    // the drawing is mostly there by the last stanza, so the part ends on a
    // finished picture rather than on one still being made
    this.charcoal.setProgress(smoothstep(0.02, 0.78, t));

    for (let i = 0; i < this.blocks.length; i++) {
      const local = beatProgress(t, this.part.beats[i]);
      const a = envelope(local, 0.14, 0.18);
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
