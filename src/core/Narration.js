/**
 * Narration — the poem read aloud, one clip per beat.
 *
 * A clip fires when you enter its beat and is not re-fired while you stay
 * there; scrubbing back and away and returning speaks it again, because
 * re-reading a stanza should sound like re-reading it. The score ducks
 * underneath so the voice always sits on top.
 */
export class Narration {
  constructor(ctx, master, manifest, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.manifest = manifest;
    this.buffers = [];
    this.node = null;
    this.spoken = -1;

    this.bus = ctx.createGain();
    this.bus.gain.value = cfg.gain;
    this.bus.connect(master);
  }

  async load(onProgress) {
    let done = 0;
    this.buffers = await Promise.all(this.manifest.map(async (m) => {
      const res = await fetch(`audio/${m.file}`);
      if (!res.ok) throw new Error(`missing audio/${m.file}`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      onProgress?.(++done / this.manifest.length);
      return buf;
    }));
  }

  /** @param {number} i beat index @param {GainNode} duck the score's bus */
  speak(i, duck) {
    if (i === this.spoken) return;
    this.spoken = i;

    const buf = this.buffers[i];
    if (!buf) return;
    const now = this.ctx.currentTime;

    if (this.node) { try { this.node.stop(now); } catch (e) { /* done already */ } }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.bus);
    src.start(now);
    this.node = src;

    // pull the strings down under the voice, and let them back up after
    if (duck) {
      const g = duck.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(this.cfg.duckTo, now + 0.4);
      g.setValueAtTime(this.cfg.duckTo, now + buf.duration);
      g.linearRampToValueAtTime(this.cfg.duckFrom, now + buf.duration + 1.2);
    }
  }

  setMuted(muted) {
    this.bus.gain.setTargetAtTime(muted ? 0 : this.cfg.gain, this.ctx.currentTime, 0.2);
  }
}
