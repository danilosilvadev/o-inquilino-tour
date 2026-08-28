/**
 * Score — this part's slice of one continuous thread.
 *
 * The Adagio runs through the whole poem, not through each scene. Every part
 * owns a slice (see tools/cut-score.py and src/config/score-map.json), laid end
 * to end so part N+1 resumes exactly where part N stopped. So there is one clip
 * here, it plays once, and when it ends the room is left to the heartbeat —
 * which is the honest result of dividing 8 minutes of music across 24 parts.
 */
export class Score {
  constructor(ctx, master, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.buffer = null;
    this.node = null;
    this.started = false;

    this.bus = ctx.createGain();
    this.bus.gain.value = cfg.gain;
    this.bus.connect(master);
  }

  async load(onProgress) {
    const res = await fetch(`audio/${this.cfg.part}.mp3`);
    if (!res.ok) throw new Error(`missing audio/${this.cfg.part}.mp3`);
    const raw = await res.arrayBuffer();
    onProgress?.(0.5);
    this.buffer = await this.ctx.decodeAudioData(raw);
    onProgress?.(1);
  }

  /** begin the part's passage; called once, when the reader enters the poem */
  start() {
    if (this.started || !this.buffer) return;
    this.started = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.bus);
    src.start(this.ctx.currentTime);
    this.node = src;
  }

  /** how far through this part's slice we are, 0→1 (for the rail, later) */
  get progress() {
    if (!this.node || !this.buffer) return 0;
    return Math.min(1, this.ctx.currentTime / this.buffer.duration);
  }

  setMuted(muted) {
    this.bus.gain.setTargetAtTime(muted ? 0 : this.cfg.gain, this.ctx.currentTime, 0.25);
  }
}
