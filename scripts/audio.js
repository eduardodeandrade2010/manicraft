// Procedural sound engine (Web Audio, no asset files). All SFX are synthesized
// from oscillators + filtered noise, so they work fully offline. Call resume()
// from a user gesture first (browsers block audio until then).

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.#makeNoise(1.0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  #makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #noise(dur, freq, q, gain, type = 'bandpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  #tone(freq, dur, gain, type = 'sine', slideTo = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  // ---- SFX ----

  shot() {
    if (!this.ctx) return;
    this.#noise(0.18, 1600, 0.7, 0.9, 'lowpass'); // crack
    this.#tone(180, 0.16, 0.5, 'square', 60);     // boom thump
    this.#noise(0.5, 400, 0.5, 0.18, 'lowpass');  // tail
  }

  blockBreak() {
    if (!this.ctx) return;
    this.#noise(0.12, 900, 1.2, 0.5, 'bandpass');
    this.#tone(120, 0.1, 0.2, 'triangle', 70);
  }

  hurt() {
    if (!this.ctx) return;
    this.#tone(420, 0.12, 0.35, 'sawtooth', 200);
  }

  kill() {
    if (!this.ctx) return;
    this.#tone(300, 0.18, 0.35, 'square', 90);
    this.#noise(0.2, 700, 0.8, 0.25);
  }

  headshot() {
    if (!this.ctx) return;
    // Bright ding + the kill.
    this.#tone(1400, 0.08, 0.4, 'sine');
    this.#tone(2100, 0.12, 0.3, 'sine');
    this.kill();
  }

  hitmarker() {
    if (!this.ctx) return;
    this.#tone(1000, 0.04, 0.25, 'square');
  }

  playerHurt() {
    if (!this.ctx) return;
    this.#tone(160, 0.25, 0.5, 'sawtooth', 80);
    this.#noise(0.2, 300, 0.6, 0.3, 'lowpass');
  }

  click() {
    if (!this.ctx) return;
    this.#tone(660, 0.05, 0.2, 'square');
  }

  pin() {
    if (!this.ctx) return;
    this.#tone(900, 0.04, 0.2, 'square');
    this.#tone(1300, 0.04, 0.15, 'square');
  }

  explosion() {
    if (!this.ctx) return;
    this.#tone(90, 0.5, 0.7, 'sawtooth', 40); // deep boom
    this.#noise(0.6, 500, 0.4, 0.6, 'lowpass'); // blast
    this.#noise(0.9, 200, 0.3, 0.3, 'lowpass'); // rumble
  }
}
