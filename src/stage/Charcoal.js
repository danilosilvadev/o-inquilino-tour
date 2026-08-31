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

/** an irregular soft-edged tear, not a clean circle */
function makeHole(size = 256, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const rnd = (i) => {
    const x = Math.sin(seed * 97.13 + i * 41.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // a wobbling outline so the edge reads as torn thread, not a punched dot
  g.beginPath();
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 0.58 + rnd(i) * 0.34 + Math.sin(a * 3 + seed) * 0.07;
    const x = r + Math.cos(a) * r * k;
    const y = r + Math.sin(a) * r * k;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#fff';
  g.fill();

  // frayed edge
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) d[i + 3] *= 0.6 + Math.random() * 0.4;
  }
  g.putImageData(img, 0, 0);
  g.filter = 'blur(9px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  return c;
}

/** a few tiles of grain, cycled, so nothing is ever perfectly still */
function makeGrain(size = 160, tiles = 4) {
  const out = [];
  for (let t = 0; t < tiles; t++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 110 + Math.random() * 145;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
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
      // holes: places the stitching never reaches. one of them sits over the
      // caption worked into the plate, so that text is torn out rather than
      // competing with the stanza on screen
      holes: 3, holeMin: 0.035, holeMax: 0.075, holeDepth: 0.82,
      captionHole: true,
      // the finish is never dead still
      grain: 0.055, grainRate: 7,
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
    this.holeSprite = makeHole(320, 7);
    this.grainTiles = makeGrain();
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

    this._weight = weight; this._wS = S; this._wH = h;

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

    this._placeHoles();
    strokes.sort((p, q) => p.score - q.score);
    strokes.forEach((st, i) => { st.at = i / (strokes.length - 1); });
    this.strokes = strokes;
  }

  /**
   * Where the stitching never reaches. One tear always covers the caption
   * worked into the top of the plate, so the poem is read on screen instead of
   * twice. The rest are scattered, and seeded so a plate tears the same way
   * every time it is opened.
   */
  _placeHoles() {
    const C = this.cfg;
    const seed = this.cfg.seed || 1;
    const rnd = (i) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const list = [];
    if (C.captionHole) {
      // big enough to actually take the whole caption off the plate
      list.push({ x: 0.845, y: 0.095, r: 0.32, sx: 1.55, sy: 0.66, depth: 1, twice: true });
    }

    // The rest go on the empty ground, never on the figure. The ink map built
    // for the stitches already knows where the subject is, so read it backwards:
    // a hole is allowed only where there is almost nothing to lose.
    const W = this._wS, H = this._wH, wt = this._weight;
    let placed = 0;
    for (let i = 0; placed < C.holes && i < 400; i++) {
      const x = 0.06 + rnd(i * 3) * 0.88;
      const y = 0.10 + rnd(i * 3 + 1) * 0.80;
      if (wt) {
        const gx = Math.min(W - 1, Math.floor(x * W));
        const gy = Math.min(H - 1, Math.floor(y * H));
        let local = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const j = Math.min(W * H - 1, Math.max(0, (gy + dy) * W + gx + dx));
            local = Math.max(local, wt[j]);
          }
        if (local > 0.46) continue;      // that is the subject: leave it alone
      }
      list.push({
        x, y,
        r: C.holeMin + rnd(i * 3 + 2) * (C.holeMax - C.holeMin),
        sx: 0.8 + rnd(i * 5) * 0.6,
        sy: 0.8 + rnd(i * 7) * 0.6,
        depth: C.holeDepth
      });
      placed++;
    }
    this.holes = list;
  }

  _punchHoles(ctx, time) {
    if (!this.holes) return;
    const W = this.canvas.width, H = this.canvas.height;
    const base = Math.min(W, H);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < this.holes.length; i++) {
      const o = this.holes[i];
      // the edges of a tear are never quite still either
      const br = 1 + Math.sin(time * 0.23 + i * 1.7) * 0.02;
      const w = base * o.r * o.sx * 2 * br;
      const h = base * o.r * o.sy * 2 * br;
      ctx.globalAlpha = o.depth ?? 1;
      ctx.drawImage(this.holeSprite, o.x * W - w / 2, o.y * H - h / 2, w, h);
      // a feathered sprite only thins what it covers; the caption has to go
      if (o.twice) ctx.drawImage(this.holeSprite, o.x * W - w / 2, o.y * H - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
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

    this._punchHoles(ctx, time);

    // grain, last: the plate keeps breathing even once it is finished
    if (C.grain > 0 && this.grainTiles) {
      const tile = this.grainTiles[Math.floor(time * C.grainRate) % this.grainTiles.length];
      const pat = ctx.createPattern(tile, 'repeat');
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = C.grain;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
