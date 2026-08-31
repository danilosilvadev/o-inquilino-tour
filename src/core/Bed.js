/**
 * Bed — one continuous piece of music under the whole poem.
 *
 * Not a slice per part any more. It starts once, loops for as long as anyone
 * is reading, and is never touched when a part hands over — so crossing from
 * one plate to the next does not interrupt it.
 *
 * The loop is crossfaded rather than butt-joined: the next pass is scheduled
 * to begin while the current one is still fading, so there is no seam.
 */
export class Bed {
  constructor(ctx, master, cfg = {}) {
    this.ctx = ctx;
    this.cfg = { file: 'audio/bed.mp3', gain: 0.5, fade: 4, ...cfg };
    this.buffer = null;
    this.timer = null;
    this.live = [];

    this.bus = ctx.createGain();
    this.bus.gain.value = this.cfg.gain;
    this.bus.connect(master);
  }

  async load() {
    const res = await fetch(this.cfg.file);
    if (!res.ok) throw new Error(`missing ${this.cfg.file}`);
    this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  start() {
    if (!this.buffer || this.started) return;
    this.started = true;
    this._pass(this.ctx.currentTime + 0.05);
  }

  /** one pass of the bed, which also books the next one before it ends */
  _pass(at) {
    const d = this.buffer.duration;
    const f = Math.min(this.cfg.fade, d / 3);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + f);
    g.gain.setValueAtTime(1, at + d - f);
    g.gain.linearRampToValueAtTime(0.0001, at + d);

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(g).connect(this.bus);
    src.start(at);
    src.stop(at + d + 0.05);
    src.onended = () => { this.live = this.live.filter((s) => s !== src); };
    this.live.push(src);

    // the next pass begins while this one is still fading, so the seam is
    // covered. Booked a little early, since timers are not sample-accurate.
    const nextAt = at + d - f;
    const wait = Math.max(200, (nextAt - this.ctx.currentTime - 2) * 1000);
    this.timer = setTimeout(() => this._pass(nextAt), wait);
  }

  setMuted(m) {
    this.bus.gain.setTargetAtTime(m ? 0 : this.cfg.gain, this.ctx.currentTime, 0.3);
  }

  stop() {
    clearTimeout(this.timer);
    for (const s of this.live) { try { s.stop(); } catch (e) { /* already done */ } }
    this.live = [];
    this.started = false;
  }
}
