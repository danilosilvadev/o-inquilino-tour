/**
 * Charcoal — a drawing that arrives by being drawn.
 *
 * The picture is static art; the animation is its appearance. Strokes are laid
 * down where the ink actually is, in an order that runs roughly head-to-foot
 * but wanders, so it fills in the way a hand fills in rather than wiping across
 * like a progress bar.
 *
 * The mask is persistent and only ever has new strokes added to it, so a frame
 * costs two drawImage calls no matter how many thousands of strokes exist.
 * Scrubbing backwards is the only case that repaints, and it is the rare one.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** a soft, grainy streak — one sprite, reused for every stroke */
function makeBrush(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;

  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.72)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);

  // charcoal is not smooth: bite holes in it so edges break up
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] *= 0.55 + Math.random() * 0.45;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class Charcoal {
  constructor(canvas, cfg = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = {
      strokes: 2600, brush: 64,
      minLen: 0.010, maxLen: 0.042, width: 0.011,
      wander: 0.55, ...cfg
    };
    this.progress = 0;
    this._painted = 0;
    this.ready = false;
  }

  async load(src) {
    this.img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`cannot load ${src}`));
      im.src = src;
    });
    this.brush = makeBrush(this.cfg.brush);
    this.plate = this._invert(this.img);
    this._buildStrokes();
    this.ready = true;
  }

  /**
   * The drawing is dark ink on paper, and the whole piece is black — on that
   * ground only the paper showed. Inverting makes it white charcoal on a dark
   * ground, which is a real medium and the only way these marks read here.
   */
  _invert(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = 255 - p[i];
      p[i + 1] = 255 - p[i + 1];
      p[i + 2] = 255 - p[i + 2];
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  /** place strokes where there is ink, and decide the order a hand would use */
  _buildStrokes() {
    const { img } = this;
    const S = 160;                                   // sampling grid
    const h = Math.max(1, Math.round((S * img.height) / img.width));
    const s = document.createElement('canvas');
    s.width = S; s.height = h;
    const sc = s.getContext('2d');
    sc.drawImage(img, 0, 0, S, h);
    const px = sc.getImageData(0, 0, S, h).data;

    // weight = how much ink is here (dark and opaque)
    const weight = new Float32Array(S * h);
    let total = 0;
    for (let i = 0; i < S * h; i++) {
      const a = px[i * 4 + 3] / 255;
      const lum = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
      const w = a * (0.25 + (1 - lum) * 0.75);
      weight[i] = w;
      total += w;
    }

    const cum = new Float32Array(S * h);
    let acc = 0;
    for (let i = 0; i < S * h; i++) { acc += weight[i]; cum[i] = acc / total; }

    const pick = () => {
      const r = Math.random();
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      return lo;
    };

    const strokes = [];
    for (let i = 0; i < this.cfg.strokes; i++) {
      const idx = pick();
      const gx = (idx % S) + Math.random();
      const gy = Math.floor(idx / S) + Math.random();
      const x = gx / S, y = gy / h;

      // mostly top to bottom, but wandering enough not to read as a wipe
      const n = Math.sin(x * 7.1 + y * 3.3) * 0.5 + Math.sin(y * 11.7 - x * 5.2) * 0.5;
      const score = y * (1 - this.cfg.wander) + (n * 0.5 + 0.5) * this.cfg.wander
                  + Math.random() * 0.06;

      strokes.push({
        x, y, score,
        a: (Math.random() - 0.5) * 2.4 + (y - 0.5) * 0.8,   // roughly follows the body
        len: this.cfg.minLen + Math.random() * (this.cfg.maxLen - this.cfg.minLen),
        w: this.cfg.width * (0.6 + Math.random() * 0.8)
      });
    }

    strokes.sort((p, q) => p.score - q.score);
    strokes.forEach((st, i) => { st.at = i / (strokes.length - 1); });
    this.strokes = strokes;
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    if (!this.ready) return;
    // fit the drawing inside the frame, never cropping it
    const k = Math.min(this.canvas.width / this.img.width, this.canvas.height / this.img.height) * 0.86;
    this.dw = this.img.width * k;
    this.dh = this.img.height * k;
    this.dx = (this.canvas.width - this.dw) / 2;
    this.dy = (this.canvas.height - this.dh) / 2;

    this.mask = document.createElement('canvas');
    this.mask.width = this.canvas.width;
    this.mask.height = this.canvas.height;
    this.mctx = this.mask.getContext('2d');
    this._painted = 0;
    this._paintTo(this.progress);
  }

  _paintTo(p) {
    const { strokes, brush, mctx } = this;
    if (!mctx) return;
    if (p < this._lastP) { mctx.clearRect(0, 0, this.mask.width, this.mask.height); this._painted = 0; }
    this._lastP = p;

    while (this._painted < strokes.length && strokes[this._painted].at <= p) {
      const st = strokes[this._painted++];
      const x = this.dx + st.x * this.dw;
      const y = this.dy + st.y * this.dh;
      const len = st.len * this.dw;
      const wid = st.w * this.dw;
      mctx.save();
      mctx.translate(x, y);
      mctx.rotate(st.a);
      mctx.globalAlpha = 0.55 + Math.random() * 0.45;
      mctx.drawImage(brush, -len / 2, -wid / 2, len, wid);
      mctx.restore();
    }
  }

  setProgress(p) {
    this.progress = clamp01(p);
    if (!this.ready || !this.mctx) return;
    this._paintTo(this.progress);

    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.progress <= 0.0005) return;
    ctx.drawImage(this.plate, this.dx, this.dy, this.dw, this.dh);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
}
