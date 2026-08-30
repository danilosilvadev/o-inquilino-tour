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
      // stitch-sized, not charcoal-sized
      minLen: 0.006, maxLen: 0.024, width: 0.007,
      wander: 0.78,
      invert: false, fit: 'cover',
      // movement: thread is not a flat surface, so it should not sit still
      drift: 0.018,       // how far the frame wanders, as a share of width
      breath: 0.006,      // the fabric rising and falling
      sheen: 0.10,        // a slow light moving across the stitching
      freshGlow: 0.45,    // new stitches land bright, then settle
      freshFade: 0.045,
      // the cloth itself moving: the picture is drawn in horizontal bands that
      // slide against each other, so the figure breathes instead of the frame
      ripple: 0.0055,     // sideways travel of a band, as a share of width
      rippleBands: 84,
      rippleSpeed: 0.42,
      ...cfg
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
    // The embroidery is already light thread on dark fabric. Only the ink
    // drawings, which are dark on pale paper, need turning over.
    this.plate = this.cfg.invert ? this._invert(this.img) : this.img;
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

    // where the marks are. On an inked drawing that is the dark; on the
    // embroidery it is the lit thread standing off the fabric.
    const weight = new Float32Array(S * h);
    let total = 0;
    for (let i = 0; i < S * h; i++) {
      const a = px[i * 4 + 3] / 255;
      const lum = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
      const ink = this.cfg.invert ? (1 - lum) : lum;
      const w = a * (0.18 + ink * 0.82);
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
    // full-bleed art fills the frame; a drawing on paper is let sit inside it
    const k = this.cfg.fit === 'cover'
      ? Math.max(this.canvas.width / this.img.width, this.canvas.height / this.img.height)
      : Math.min(this.canvas.width / this.img.width, this.canvas.height / this.img.height) * 0.86;
    this.dw = this.img.width * k;
    this.dh = this.img.height * k;
    this.dx = (this.canvas.width - this.dw) / 2;
    this.dy = (this.canvas.height - this.dh) / 2;

    this.mask = document.createElement('canvas');
    this.mask.width = this.canvas.width;
    this.mask.height = this.canvas.height;
    this.mctx = this.mask.getContext('2d');

    // the stitches placed most recently, kept hot for a moment
    this.hot = document.createElement('canvas');
    this.hot.width = this.canvas.width;
    this.hot.height = this.canvas.height;
    this.hctx = this.hot.getContext('2d');
    this._painted = 0;
    this._paintTo(this.progress);
  }

  _paintTo(p) {
    const { strokes, brush, mctx } = this;
    if (!mctx) return;
    if (p < this._lastP) { mctx.clearRect(0, 0, this.mask.width, this.mask.height); this._painted = 0; }
    this._lastP = p;

    let batch = 0;
    while (this._painted < strokes.length && strokes[this._painted].at <= p) {
      const st = strokes[this._painted++];
      batch++;
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

      if (this.hctx && batch < 160) {
        this.hctx.save();
        this.hctx.translate(x, y);
        this.hctx.rotate(st.a);
        this.hctx.drawImage(brush, -len / 2, -wid / 2, len, wid);
        this.hctx.restore();
      }
    }
  }

  /**
   * The picture is a still, so nothing in it can move on its own. Drawing it
   * as a stack of thin horizontal bands and sliding them against each other
   * makes the cloth stir — the figure shifts rather than the whole frame
   * sliding, which is what reads as movement.
   */
  _drawCloth(ctx, x, y, w, h, time) {
    const C = this.cfg;
    const n = Math.max(1, C.rippleBands | 0);
    const amp = w * C.ripple;
    if (amp < 0.01) { ctx.drawImage(this.plate, x, y, w, h); return; }

    const sh = this.plate.height / n;
    const dh = h / n;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const off = Math.sin(f * 5.6 + time * C.rippleSpeed) * amp
                + Math.sin(f * 13.1 - time * C.rippleSpeed * 0.63) * amp * 0.45;
      ctx.drawImage(
        this.plate,
        0, i * sh, this.plate.width, sh + 1,
        x + off, y + i * dh, w, dh + 1
      );
    }
  }

  setProgress(p, time = 0) {
    this.progress = clamp01(p);
    if (!this.ready || !this.mctx) return;
    if (!Number.isFinite(time)) time = 0;
    this._paintTo(this.progress);

    const C = this.cfg;
    const { ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;

    // ── the frame is never quite still ──
    // cover already overflows the canvas, so there is room to wander inside it
    const slackX = Math.max(0, this.dw - W) * 0.5;
    const slackY = Math.max(0, this.dh - H) * 0.5;
    const wx = Math.sin(time * 0.07) * Math.min(slackX, W * C.drift);
    const wy = Math.cos(time * 0.051) * Math.min(slackY, H * C.drift * 0.6);
    const breath = 1 + Math.sin(time * 0.19) * C.breath;
    const bw = this.dw * breath, bh = this.dh * breath;
    const bx = this.dx - (bw - this.dw) * 0.5 + wx;
    const by = this.dy - (bh - this.dh) * 0.5 + wy;

    ctx.clearRect(0, 0, W, H);
    if (this.progress <= 0.0005) return;

    // Stitches never quite tile the frame, so at full progress the picture was
    // still being viewed through the gaps between them. Past 0.88 the finished
    // artwork settles in underneath, and the part ends on the piece itself.
    const settle = clamp01((this.progress - 0.88) / 0.12);

    const ok = Number.isFinite(bx) && Number.isFinite(by) &&
               Number.isFinite(bw) && Number.isFinite(bh);
    const X = ok ? bx : this.dx, Y = ok ? by : this.dy;
    const BW = ok ? bw : this.dw, BH = ok ? bh : this.dh;
    if (!this.scratch || this.scratch.width !== W) {
      this.scratch = document.createElement('canvas');
      this.scratch.width = W; this.scratch.height = H;
      this.sctx = this.scratch.getContext('2d');
    }

    // the stitched-so-far layer, built off-screen so a settled base can sit under it
    this.sctx.globalCompositeOperation = 'source-over';
    this.sctx.clearRect(0, 0, W, H);
    this._drawCloth(this.sctx, X, Y, BW, BH, time);
    this.sctx.globalCompositeOperation = 'destination-in';
    this.sctx.drawImage(this.mask, 0, 0);
    this.sctx.globalCompositeOperation = 'source-over';

    if (settle > 0) {
      ctx.globalAlpha = settle;
      this._drawCloth(ctx, X, Y, BW, BH, time);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.scratch, 0, 0);

    // ── light travelling over the thread ──
    // source-atop keeps it on the stitching and off the empty ground
    if (C.sheen > 0 && settle < 1) {
      const band = W * 0.55;
      const cx = ((time * 0.045) % 1.6 - 0.3) * (W + band) - band * 0.5;
      const g = ctx.createLinearGradient(cx, 0, cx + band, H * 0.6);
      g.addColorStop(0, 'rgba(255,246,232,0)');
      g.addColorStop(0.5, `rgba(255,246,232,${C.sheen})`);
      g.addColorStop(1, 'rgba(255,246,232,0)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // ── the stitches just laid down are still bright ──
    if (this.hctx && C.freshGlow > 0) {
      this.hctx.globalCompositeOperation = 'destination-out';
      this.hctx.fillStyle = `rgba(0,0,0,${C.freshFade})`;
      this.hctx.fillRect(0, 0, W, H);
      this.hctx.globalCompositeOperation = 'source-over';

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = C.freshGlow * (1 - settle);
      ctx.drawImage(this.hot, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
