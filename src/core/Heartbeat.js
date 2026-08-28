/**
 * Heartbeat — synthesised, not sampled. Nothing to download.
 * Two thuds per cycle (lub-dub) over a low room drone. The visual pulse in the
 * scene is deliberately offset from this one: you hear a heart you do not drive.
 */
export class Heartbeat {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this._timer = null;
    this.intensity = 1;   // scene raises this as the drag gets heavier
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this._room();
    this._schedule();
  }

  /** low, dead room tone — filtered noise, barely there */
  _room() {
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.021 * white) / 1.021;   // brown-ish noise
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190;

    this.roomGain = this.ctx.createGain();
    this.roomGain.gain.value = this.cfg.roomGain;

    src.connect(lp).connect(this.roomGain).connect(this.master);
    src.start();
    this.roomSrc = src;
  }

  _schedule() {
    const period = 60 / this.cfg.bpm;
    const tick = () => {
      if (!this.muted) {
        this._thud(this.ctx.currentTime, 1.0);
        this._thud(this.ctx.currentTime + period * 0.19, 0.62);
      }
      this._timer = setTimeout(tick, period * 1000);
    };
    tick();
  }

  /** one heart stroke: a pitched-down sine thump with a click transient */
  _thud(when, strength) {
    const g = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const base = 62;
    osc.frequency.setValueAtTime(base * 1.9, when);
    osc.frequency.exponentialRampToValueAtTime(base * 0.52, when + 0.16);

    const peak = this.cfg.thudGain * strength * this.intensity;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.34);

    osc.connect(g).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.4);
  }

  setIntensity(v) { this.intensity = 0.7 + v * 0.9; }

  toggle() {
    this.muted = !this.muted;
    if (this.roomGain) {
      this.roomGain.gain.setTargetAtTime(this.muted ? 0 : this.cfg.roomGain, this.ctx.currentTime, 0.2);
    }
    return this.muted;
  }
}
