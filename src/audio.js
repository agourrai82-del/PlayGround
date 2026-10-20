const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambient = null;
    this.staticBus = null;
    this.heartbeat = null;
    this.tension = 0;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 22;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.28;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    this.noiseBuffer = this.makeNoise(2.2);
    this.buildAmbient();
    this.buildStatic();
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  buildAmbient() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.0;
    bus.connect(this.master);
    this.ambient = { bus, nodes: [] };

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 3;
    filter.connect(bus);
    this.ambient.filter = filter;

    [41.2, 55, 82.4, 110.3].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1.5) * 7;
      const gain = ctx.createGain();
      gain.gain.value = [0.5, 0.3, 0.16, 0.08][i];
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      this.ambient.nodes.push(osc, gain);
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.ambient.nodes.push(lfo, lfoGain);

    const air = ctx.createBufferSource();
    air.buffer = this.noiseBuffer;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 480;
    airFilter.Q.value = 0.6;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.16;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(bus);
    air.start();
    this.ambient.nodes.push(air, airFilter, airGain);

    this.setAmbient(0.55);
  }

  buildStatic() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 3400;
    peak.gain.value = 7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp);
    hp.connect(peak);
    peak.connect(gain);
    gain.connect(this.master);
    src.start();
    this.staticBus = { gain, hp };
  }

  setAmbient(level, tension = this.tension) {
    if (!this.ctx || !this.ambient) return;
    const now = this.ctx.currentTime;
    this.ambient.bus.gain.setTargetAtTime(clamp(level, 0, 1) * 0.5, now, 0.6);
    if (this.ambient.filter) {
      this.ambient.filter.frequency.setTargetAtTime(240 + tension * 900, now, 1.2);
    }
  }

  setStatic(level) {
    if (!this.ctx || !this.staticBus) return;
    const now = this.ctx.currentTime;
    this.staticBus.gain.gain.setTargetAtTime(clamp(level, 0, 0.6) * 0.32, now, 0.18);
    this.staticBus.hp.frequency.setTargetAtTime(level > 0.05 ? 700 : 1400, now, 0.4);
  }

  setTension(value) {
    this.tension = clamp(value, 0, 1);
    this.setAmbient(0.55, this.tension);
  }

  startHeartbeat() {
    if (!this.ctx || this.heartbeat) return;
    const beat = () => {
      if (!this.heartbeat) return;
      if (this.ctx.state === 'running') {
        const tension = this.tension;
        this.thump(0.0, 0.55 + tension * 0.3);
        this.thump(0.22, 0.4 + tension * 0.2);
        this.heartbeat = setTimeout(beat, 900 - tension * 430 + Math.random() * 70);
      } else {
        this.heartbeat = setTimeout(beat, 400);
      }
    };
    this.heartbeat = setTimeout(beat, 120);
  }

  stopHeartbeat() {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = null;
  }

  thump(offset, strength = 0.6) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(64, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  noiseBurst({ duration = 0.3, gain = 0.4, freq = 1800, type = 'bandpass', q = 1, when = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  whisper() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(720, t);
    filter.frequency.linearRampToValueAtTime(1700, t + 0.9);
    filter.Q.value = 5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 1.2);
  }

  footstep() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  doorCreak() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.linearRampToValueAtTime(46, t + 1.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, t);
    filter.frequency.linearRampToValueAtTime(240, t + 1.1);
    filter.Q.value = 9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.3);
    this.noiseBurst({ duration: 0.5, gain: 0.12, freq: 900 });
  }

  ui() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.08, gain: 0.12, freq: 2200, q: 3 });
  }

  scare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.noiseBurst({ duration: 1.5, gain: 0.85, freq: 2600, type: 'bandpass', q: 0.7 });

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 1.1);
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(932, t);
    osc2.frequency.exponentialRampToValueAtTime(61, t + 1.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.34, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.4);
    osc2.stop(t + 1.4);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 1.6);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.8, t + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    sub.connect(subGain);
    subGain.connect(this.master);
    sub.start(t);
    sub.stop(t + 1.8);
  }

  glitch() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.18, gain: 0.2, freq: 3400, q: 2 });
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200 + Math.random() * 1400, t);
    osc.frequency.setValueAtTime(160 + Math.random() * 900, t + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  deathSwell() {
    if (!this.ctx) return;
    this.stopHeartbeat();
    this.noiseBurst({ duration: 2.4, gain: 0.5, freq: 300, type: 'lowpass' });
    this.setStatic(0);
  }

  reset() {
    this.stopHeartbeat();
    this.setTension(0);
    this.setStatic(0);
    if (this.ctx) this.setAmbient(0.55, 0);
  }
}
