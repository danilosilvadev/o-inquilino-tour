/**
 * Bed — the music under the poem.
 *
 * One piece per canto, not per part. Each piece loops for as long as it is
 * wanted, crossfaded into itself so the loop has no seam, and crossing from
 * one to the next is a slow fade rather than a cut.
 *
 * Nothing here is touched when a part hands over — only when the piece
 * actually changes. Two cantos on the same piece cross without a ripple.
 */
export class Bed {
  constructor(ctx, master, cfg = {}) {
    this.ctx = ctx;
    this.cfg = { gain: 0.5, loopFade: 5, switchFade: 6, ...cfg };
    this.tracks = new Map();     // name -> { buffer, gain, timer, live }
    this.loading = new Map();    // name -> promise, so a piece is fetched once
    this.current = null;
    this.onPlay = null;          // called with the piece coming up, or null for none

    this.bus = ctx.createGain();
    this.bus.gain.value = this.cfg.gain;
    this.bus.connect(master);
  }

  /**
   * `piece` says where the recording really starts and ends (its silences are
   * skipped, and the loop is cut there) and how loud it should sit.
   */
  load(name, piece = {}) {
    if (this.tracks.has(name)) return Promise.resolve();
    if (!this.loading.has(name)) {
      this.loading.set(name, this._fetch(name, piece).finally(() => this.loading.delete(name)));
    }
    return this.loading.get(name);
  }

  async _fetch(name, { file = name, start = 0, end = null, gain: level = 1 }) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`missing ${file}`);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    end = Math.min(end || buffer.duration, buffer.duration);
    this.tracks.set(name, { buffer, gain, level, start, end, timer: null, live: [] });
    // the poem may already have crossed into this piece while it was loading
    if (this.wanted === name) this.switchTo(name);
  }

  /**
   * Bring a piece up and take the other down. The old one goes the moment it
   * is asked to, whether or not the new one has landed — a canto is never
   * heard under the wrong music, only under silence until its own arrives.
   */
  switchTo(name) {
    this.wanted = name;
    if (this.current === name) return;
    const now = this.ctx.currentTime;
    const f = this.cfg.switchFade;

    if (this.current) {
      const prevName = this.current;
      const prev = this.tracks.get(prevName);
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
      prev.gain.gain.linearRampToValueAtTime(0.0001, now + f);
      // let it finish fading before its loops are torn down — unless the poem
      // has come back to it in the meantime
      setTimeout(() => { if (this.current !== prevName) this._silence(prev); }, (f + 0.5) * 1000);
      this.current = null;
      this.onPlay?.(null);
    }

    const next = this.tracks.get(name);
    if (!next) { console.log(`[o inquilino] music: waiting for ${name}`); return; }
    console.log(`[o inquilino] music: ${name}`);
    this.current = name;
    this.onPlay?.(name);
    if (!next.running) this._pass(name, now + 0.05, true);
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(next.gain.gain.value, now);
    next.gain.gain.linearRampToValueAtTime(next.level, now + f);
  }

  /** one pass of a piece, which books the next before it ends */
  _pass(name, at, first = false) {
    const t = this.tracks.get(name);
    if (!t) return;
    t.running = true;

    const d = t.end - t.start;
    const f = Math.min(this.cfg.loopFade, d / 3);

    // the loop fade is for the seam; the first pass is already faded in by the
    // switch, and a piece with a soft opening should not be pushed under twice
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(first ? 1 : 0.0001, at);
    if (!first) g.gain.linearRampToValueAtTime(1, at + f);
    g.gain.setValueAtTime(1, at + d - f);
    g.gain.linearRampToValueAtTime(0.0001, at + d);

    const src = this.ctx.createBufferSource();
    src.buffer = t.buffer;
    src.connect(g).connect(t.gain);
    src.start(at, t.start);
    src.stop(at + d + 0.05);
    src.onended = () => { t.live = t.live.filter((s) => s !== src); };
    t.live.push(src);

    const nextAt = at + d - f;
    const wait = Math.max(200, (nextAt - this.ctx.currentTime - 2) * 1000);
    t.timer = setTimeout(() => this._pass(name, nextAt), wait);
  }

  _silence(t) {
    if (!t) return;
    clearTimeout(t.timer);
    for (const s of t.live) { try { s.stop(); } catch (e) { /* already done */ } }
    t.live = [];
    t.running = false;
  }

  fadeOut(sec = 12) {
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, sec / 3);
  }

  setMuted(m) {
    this.bus.gain.setTargetAtTime(m ? 0 : this.cfg.gain, this.ctx.currentTime, 0.3);
  }

  stop() {
    for (const t of this.tracks.values()) this._silence(t);
    this.current = null;
    this.onPlay?.(null);
  }
}
