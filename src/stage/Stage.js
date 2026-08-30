import { el } from './Skeleton.js';
import { Skeleton, REST } from './Skeleton.js';
import { buildLandscape, GROUND } from './Landscapes.js';
import { beatProgress, envelope, smoothstep, lerp } from '../core/Scrubber.js';

const VB = { w: 1000, h: 520 };

/**
 * Stage — one part of the poem.
 *
 * A landscape for the canto, a very small person standing in it, and the
 * stanza in HTML over the top. He never mimes the words; each canto simply
 * gives him a different thing to be standing inside, and a different way of
 * holding himself while he does.
 */
export class Stage {
  constructor(root, part) {
    this.part = part;
    this.canto = part.canto;

    this.svg = el('svg', {
      viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: 'xMidYMid slice', class: 'stage'
    });
    root.appendChild(this.svg);

    this.land = buildLandscape(this.svg, this.canto);
    this.ground = GROUND[this.canto] ?? 380;

    this.figure = new Skeleton(this.svg, { scale: 1 });
    // Canto V is the only part of the poem with another person in it
    this.other = this.canto === 'Canto V' ? new Skeleton(this.svg, { scale: 1 }) : null;

    this.words = document.createElement('div');
    this.words.className = 'words';
    root.appendChild(this.words);

    this.blocks = part.beats.map((beat, i) => {
      const b = document.createElement('div');
      b.className = 'stanza' + (i % 2 ? ' right' : '');
      b.innerHTML = beat.lines
        .map((l, j) => `<span style="--i:${j}">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`)
        .join('');
      this.words.appendChild(b);
      return b;
    });
  }

  /** how he holds himself in this canto — a feeling, not an action */
  _pose(t, time) {
    const breath = Math.sin(time * 0.6) * 1.4;
    const sway = Math.sin(time * 0.31) * 1.6 + Math.sin(time * 0.17) * 1.0;
    const p = { ...REST, lean: sway * 0.4, neckTilt: -sway * 0.5 };

    switch (this.canto) {
      case 'Canto I':      // a guest: upright, but never quite settled
        p.armLU = 168 + breath; p.armRU = -168 - breath;
        break;
      case 'Canto II':     // the ceiling comes down and he goes down with it
        p.crouch = t * 5.5;
        p.legLU = 4 + t * 26; p.legLF = 2 - t * 30;
        p.legRU = -4 - t * 26; p.legRF = -2 + t * 30;
        p.lean += t * 7;
        break;
      case 'Canto III':    // nothing under him; the limbs give up their angles
        p.spine = 180 + Math.sin(time * 0.4) * 6;
        p.armLU = 150 - t * 40; p.armRU = -150 + t * 40;
        p.legLU = 8 + t * 12; p.legRU = -8 - t * 12;
        p.neckTilt = 12 + t * 10;
        break;
      case 'Canto IV':     // bent toward the ground, listening to it
        p.lean += t * 16;
        p.neckTilt = t * 22;
        p.armLU = 150 + t * 14; p.armRU = -150 - t * 14;
        break;
      case 'Canto V':      // he turns toward the other one
        p.lean += -6 * smoothstep(0.1, 0.5, t) + 10 * smoothstep(0.62, 1, t);
        p.armLU = 168 - 40 * smoothstep(0.15, 0.55, t) * (1 - smoothstep(0.66, 1, t));
        p.armLF = 176 - 30 * smoothstep(0.2, 0.6, t) * (1 - smoothstep(0.66, 1, t));
        break;
      case 'Canto VI':     // still going round it
        p.lean += Math.sin(time * 0.5) * 5;
        p.armLU = 160 + Math.sin(time * 0.5) * 16;
        p.armRU = -160 + Math.sin(time * 0.5 + 1.1) * 16;
        break;
    }
    return p;
  }

  update(t, time) {
    this.land.update(t, time);

    // where he stands, and how small he is in it
    const drift = {
      'Canto I':   lerp(360, 470, smoothstep(0, 1, t)),
      'Canto II':  500,
      'Canto III': 500,
      'Canto IV':  lerp(430, 560, t),
      'Canto V':   lerp(360, 415, smoothstep(0, 0.6, t)),
      'Canto VI':  500 + Math.sin(time * 0.5) * 86
    }[this.canto] ?? 500;

    const scale = this.canto === 'Canto III' ? 0.85 : 1;
    const y = this.canto === 'Canto III'
      ? lerp(210, 330, smoothstep(0, 1, t))
      : this.ground;

    this.figure.setPosition(drift, y, scale);
    this.figure.pose(this._pose(t, time));
    this.figure.setOpacity(lerp(1, 0.25, this.canto === 'Canto III' ? t : 0));

    if (this.other) {
      const near = smoothstep(0.12, 0.5, t);
      const gone = smoothstep(0.62, 0.95, t);
      this.other.setPosition(lerp(700, 470, near), this.ground, 1);
      this.other.pose({ ...REST, lean: -3, armRU: -168 + 34 * near });
      this.other.setOpacity(near * (1 - gone));
      // the ring in Canto VI is worn by walking; here the floor keeps the marks
      this.figure.g.style.setProperty('--near', near.toFixed(2));
    }

    // the stanza: one at a time, arriving and leaving with the playhead
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
    this.svg.remove();
    this.words.remove();
  }
}
