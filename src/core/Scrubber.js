/**
 * Scrubber — the whole piece is one timeline, 0 → 1.
 * There is no page scroll (the document never exceeds the viewport); wheel,
 * drag and keys move a virtual playhead that everything else reads from.
 */
export class Scrubber {
  constructor(cfg) {
    this.cfg = cfg;
    this.target = 0;
    this.value = 0;
    this.velocity = 0;
    this._touchY = 0;
    this._dragging = false;
    this._bind();
  }

  _bind() {
    const opts = { passive: false };

    this._onWheel = (e) => {
      e.preventDefault();
      this.push(e.deltaY * this.cfg.wheelScale);
    };

    this._onTouchStart = (e) => {
      this._dragging = true;
      this._touchY = e.touches[0].clientY;
    };
    this._onTouchMove = (e) => {
      if (!this._dragging) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      this.push((this._touchY - y) * this.cfg.touchScale);
      this._touchY = y;
    };
    this._onTouchEnd = () => { this._dragging = false; };

    this._onKey = (e) => {
      const down = ['ArrowDown', 'PageDown', ' ', 'Spacebar'];
      const up = ['ArrowUp', 'PageUp'];
      if (down.includes(e.key)) { e.preventDefault(); this.push(this.cfg.keyStep); }
      else if (up.includes(e.key)) { e.preventDefault(); this.push(-this.cfg.keyStep); }
      else if (e.key === 'Home') this.target = 0;
      else if (e.key === 'End') this.target = 1;
    };

    window.addEventListener('wheel', this._onWheel, opts);
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchmove', this._onTouchMove, opts);
    window.addEventListener('touchend', this._onTouchEnd, { passive: true });
    window.addEventListener('keydown', this._onKey);
  }

  push(delta) {
    this.target = Math.min(1, Math.max(0, this.target + delta));
  }

  /** Call once per frame. Returns the eased playhead. */
  update() {
    const prev = this.value;
    this.value += (this.target - this.value) * this.cfg.ease;
    this.velocity = this.value - prev;
    return this.value;
  }

  dispose() {
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('keydown', this._onKey);
  }
}

/** Normalised 0→1 position inside a beat's [from,to] window, clamped. */
export function beatProgress(t, beat) {
  return Math.min(1, Math.max(0, (t - beat.from) / (beat.to - beat.from)));
}

/** 0 → 1 → 0 envelope with soft shoulders, for fading a stanza in and out. */
export function envelope(local, fadeIn, fadeOut) {
  const a = smoothstep(0, fadeIn, local);
  const b = 1 - smoothstep(1 - fadeOut, 1, local);
  return Math.min(a, b);
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a, b, t) => a + (b - a) * t;
