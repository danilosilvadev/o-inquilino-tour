/**
 * Bed — the music under the poem.
 *
 * Two pieces, not one per part: the poem changes register at Canto V, where
 * the other person arrives, and the music changes with it. Each piece loops
 * for as long as it is wanted, crossfaded into itself so the loop has no seam,
 * and crossing between the two is a slow fade rather than a cut.
 *
 * Nothing here is touched when a part hands over — only when the register
 * actually changes.
 */
export class Bed {
  constructor(ctx, master, cfg = {}) {
    this.ctx = ctx;
    this.cfg = { gain: 0.5, loopFade: 5, switchFade: 6, ...cfg };
    this.tracks = new Map();     // name -> { buffer, gain, timer, live }
    this.current = null;

    this.bus = ctx.createGain();
    this.bus.gain.value = this.cfg.gain;
    this.bus.connect(master);
  }

  async load(name, file) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`missing ${file}`);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    this.tracks.set(name, { buffer, gain, timer: null, live: [] });
  }

  /** bring a piece up, take the other down; a no-op if it is already playing */
  switchTo(name) {
    const next = this.tracks.get(name);
    if (!next || this.current === name) return;
    const now = this.ctx.currentTime;
    const f = this.cfg.switchFade;

    if (this.current) {
      const prev = this.tracks.get(this.current);
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
      prev.gain.gain.linearRampToValueAtTime(0.0001, now + f);
      // let it finish fading before its loops are torn down
      setTimeout(() => this._silence(this.tracks.get(name) === prev ? null : prev), (f + 0.5) * 1000);
    }

    this.current = name;
    if (!next.running) this._pass(name, now + 0.05);
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(next.gain.gain.value, now);
    next.gain.gain.linearRampToValueAtTime(1, now + f);
  }

  /** one pass of a piece, which books the next before it ends */
  _pass(name, at) {
    const t = this.tracks.get(name);
    if (!t) return;
    t.running = true;

    const d = t.buffer.duration;
    const f = Math.min(this.cfg.loopFade, d / 3);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + f);
    g.gain.setValueAtTime(1, at + d - f);
    g.gain.linearRampToValueAtTime(0.0001, at + d);

    const src = this.ctx.createBufferSource();
    src.buffer = t.buffer;
    src.connect(g).connect(t.gain);
    src.start(at);
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

  setMuted(m) {
    this.bus.gain.setTargetAtTime(m ? 0 : this.cfg.gain, this.ctx.currentTime, 0.3);
  }

  stop() {
    for (const t of this.tracks.values()) this._silence(t);
    this.current = null;
  }
}
