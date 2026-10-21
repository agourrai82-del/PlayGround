(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  class HorrorAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.ambient = null;
      this.noise = null;
      this.enabled = true;
      this.heartTimer = 0;
      this.started = false;
      this.scene = 'title';
      this.danger = 0;
      this.creakTimer = 8;
    }

    init() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (error) {
        return false;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
      this.buildNoise();
      return true;
    }

    resume() {
      if (!this.init()) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }

    buildNoise() {
      const ctx = this.ctx;
      const length = Math.floor(ctx.sampleRate * 2.5);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2 + white * 0.35;
      }
      this.noise = buffer;
    }

    noiseSource(loop) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = Boolean(loop);
      return src;
    }

    startAmbient() {
      if (!this.ctx || this.started) return;
      this.started = true;
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.connect(this.master);

      const drone = ctx.createGain();
      drone.gain.value = 0.16;
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 190;
      droneFilter.Q.value = 3;
      drone.connect(droneFilter).connect(out);

      const oscs = [];
      const specs = [
        { f: 38, type: 'sine', g: 0.55 },
        { f: 41.5, type: 'sine', g: 0.35 },
        { f: 57, type: 'triangle', g: 0.18 },
        { f: 76.4, type: 'sawtooth', g: 0.05 }
      ];
      for (const spec of specs) {
        const osc = ctx.createOscillator();
        osc.type = spec.type;
        osc.frequency.value = spec.f;
        const gain = ctx.createGain();
        gain.gain.value = spec.g;
        osc.connect(gain).connect(drone);
        osc.start();
        oscs.push(osc);
      }

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 46;
      lfo.connect(lfoGain).connect(droneFilter.frequency);
      lfo.start();
      oscs.push(lfo);

      const wind = this.noiseSource(true);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 320;
      windFilter.Q.value = 0.7;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.045;
      wind.connect(windFilter).connect(windGain).connect(out);
      wind.start();

      const windLfo = ctx.createOscillator();
      windLfo.frequency.value = 0.11;
      const windLfoGain = ctx.createGain();
      windLfoGain.gain.value = 0.028;
      windLfo.connect(windLfoGain).connect(windGain.gain);
      windLfo.start();
      oscs.push(windLfo);

      const hiss = this.noiseSource(true);
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'highpass';
      hissFilter.frequency.value = 5200;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.012;
      hiss.connect(hissFilter).connect(hissGain).connect(out);
      hiss.start();

      out.gain.setTargetAtTime(0.9, ctx.currentTime, 2.4);

      this.ambient = { out, drone, droneFilter, windGain, hissGain, sources: oscs.concat([wind, hiss]) };
    }

    setScene(scene) {
      this.scene = scene;
      if (!this.ctx || !this.ambient) return;
      const target = scene === 'game' ? 1 : scene === 'cutscene' ? 0.7 : 0.85;
      this.ambient.out.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2);
    }

    setDanger(value) {
      this.danger = clamp(value, 0, 1);
      if (!this.ctx || !this.ambient) return;
      const t = this.ctx.currentTime;
      this.ambient.droneFilter.frequency.setTargetAtTime(190 + this.danger * 320, t, 0.4);
      this.ambient.hissGain.gain.setTargetAtTime(0.012 + this.danger * 0.05, t, 0.5);
      this.ambient.windGain.gain.setTargetAtTime(0.045 + this.danger * 0.03, t, 0.7);
    }

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.08);
    }

    toggle() {
      this.setEnabled(!this.enabled);
      this.resume();
      return this.enabled;
    }

    update(dt, fear, active) {
      if (!this.ctx || !this.started) return;
      if (!active) {
        this.heartTimer = 0;
        this.creakTimer = 8;
        return;
      }
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const interval = 1.45 - (fear / 100) * 1.02;
        this.heartTimer = interval + Math.random() * 0.08;
        this.heartbeat(fear / 100);
      }
      this.creakTimer -= dt;
      if (this.creakTimer <= 0) {
        this.creakTimer = 9 + Math.random() * 16;
        this.creak();
      }
    }

    heartbeat(intensity) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const gainAmt = 0.18 + intensity * 0.34;
      for (let i = 0; i < 2; i += 1) {
        const start = t + i * (0.17 + intensity * 0.03);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(66, start);
        osc.frequency.exponentialRampToValueAtTime(33, start + 0.16);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainAmt * (i ? 0.72 : 1), start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        osc.connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(start + 0.24);
      }
    }

    step(sprinting) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = this.noiseSource(false);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 360 + Math.random() * 240;
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      const level = (sprinting ? 0.12 : 0.075) * (0.85 + Math.random() * 0.3);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t, Math.random() * 1.5, 0.14);
    }

    creak() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = 70 + Math.random() * 60;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * 1.9, t + 0.9);
      osc.frequency.linearRampToValueAtTime(base * 0.8, t + 1.6);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 420;
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 1.75);
    }

    pickup() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 880];
      notes.forEach((freq, index) => {
        const start = t + index * 0.085;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
        osc.connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(start + 0.75);
      });
      const src = this.noiseSource(false);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t, 0, 0.2);
    }

    scare() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const boom = ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(120, t);
      boom.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      const boomGain = ctx.createGain();
      boomGain.gain.setValueAtTime(0.0001, t);
      boomGain.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      boom.connect(boomGain).connect(this.master);
      boom.start(t);
      boom.stop(t + 1.15);

      const scream = ctx.createOscillator();
      scream.type = 'sawtooth';
      scream.frequency.setValueAtTime(180, t);
      scream.frequency.exponentialRampToValueAtTime(880, t + 0.16);
      scream.frequency.exponentialRampToValueAtTime(130, t + 1.0);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 26;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 55;
      vibrato.connect(vibratoGain).connect(scream.frequency);
      const screamFilter = ctx.createBiquadFilter();
      screamFilter.type = 'bandpass';
      screamFilter.frequency.value = 900;
      screamFilter.Q.value = 2.4;
      const screamGain = ctx.createGain();
      screamGain.gain.setValueAtTime(0.0001, t);
      screamGain.gain.exponentialRampToValueAtTime(0.24, t + 0.03);
      screamGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
      scream.connect(screamFilter).connect(screamGain).connect(this.master);
      scream.start(t);
      scream.stop(t + 1.1);
      vibrato.start(t);
      vibrato.stop(t + 1.1);

      const staticSrc = this.noiseSource(false);
      const staticFilter = ctx.createBiquadFilter();
      staticFilter.type = 'highpass';
      staticFilter.frequency.value = 1800;
      const staticGain = ctx.createGain();
      staticGain.gain.setValueAtTime(0.0001, t);
      staticGain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      staticGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      staticSrc.connect(staticFilter).connect(staticGain).connect(this.master);
      staticSrc.start(t, 0, 1);
    }

    door() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.linearRampToValueAtTime(58, t + 1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.07, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 1.25);

      const knock = ctx.createOscillator();
      knock.type = 'sine';
      knock.frequency.setValueAtTime(88, t);
      knock.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      const knockGain = ctx.createGain();
      knockGain.gain.setValueAtTime(0.4, t + 1.0);
      knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      knock.connect(knockGain).connect(this.master);
      knock.start(t + 1.0);
      knock.stop(t + 1.4);
    }

    enterVideo() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = this.noiseSource(false);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(5200, t + 0.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t, 0, 1);

      const boom = ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(90, t);
      boom.frequency.exponentialRampToValueAtTime(32, t + 0.6);
      const boomGain = ctx.createGain();
      boomGain.gain.setValueAtTime(0.5, t);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      boom.connect(boomGain).connect(this.master);
      boom.start(t);
      boom.stop(t + 0.95);
    }

    win() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      [110, 164.81, 220, 329.63].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = index % 2 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = t + index * 0.1;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.1, start + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.4);
        osc.connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(start + 3.5);
      });
    }

    lose() {
      if (!this.ctx) return;
      this.scare();
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.15;
      [92.5, 98, 138.6, 196].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        osc.connect(filter).connect(gain).connect(this.master);
        osc.start(t);
        osc.stop(t + 3.7);
      });
    }
  }

  window.HorrorAudio = HorrorAudio;
})();
