/* Original, synthesised sound effects. No audio files or network access needed. */
(function () {
  'use strict';

  class GameAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.noiseBuffer = null;
      this.muted = false;
      this.lastStep = -Infinity;
    }

    async init() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;

        try {
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.gain.value = this.muted ? 0 : 0.42;
          this.master.connect(this.context.destination);
          this.noiseBuffer = this.makeNoiseBuffer();
        } catch (_) {
          this.context = null;
          this.master = null;
          return false;
        }
      }

      try {
        if (this.context.state !== 'running') await this.context.resume();
      } catch (_) {
        return false;
      }
      return this.context.state === 'running';
    }

    resume() {
      return this.init();
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.context.currentTime, 0.015);
      }
    }

    get ready() {
      return !this.muted && this.context && this.context.state === 'running';
    }

    makeNoiseBuffer() {
      const context = this.context;
      const length = Math.ceil(context.sampleRate * 0.7);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
      return buffer;
    }

    tone(start, end, duration, volume, type = 'sine', delay = 0) {
      if (!this.ready) return;
      const context = this.context;
      const at = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, start), at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), at + duration);
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.012, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }

    noise(duration, volume, cutoff = 2400, delay = 0) {
      if (!this.ready || !this.noiseBuffer) return;
      const context = this.context;
      const at = context.currentTime + delay;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      gain.gain.setValueAtTime(Math.max(0.001, volume), at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      const offset = Math.random() * Math.max(0, 0.7 - duration);
      source.start(at, offset, duration);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    }

    fire() {
      this.noise(0.16, 0.42, 1300);
      this.tone(115, 43, 0.19, 0.23, 'sawtooth');
    }

    reload() {
      this.noise(0.035, 0.22, 4200);
      this.tone(370, 270, 0.055, 0.12, 'square');
      this.noise(0.06, 0.25, 3500, 0.31);
      this.tone(570, 410, 0.075, 0.12, 'square', 0.31);
    }

    hit() {
      this.noise(0.26, 0.24, 900);
      this.tone(95, 38, 0.27, 0.24, 'sawtooth');
    }

    pickup() {
      this.tone(520, 650, 0.11, 0.15, 'sine');
      this.tone(780, 980, 0.16, 0.14, 'sine', 0.09);
    }

    enemyHit() {
      this.noise(0.12, 0.20, 1700);
      this.tone(240, 115, 0.12, 0.11, 'triangle');
    }

    enemyDeath() {
      this.noise(0.34, 0.24, 1000);
      this.tone(170, 35, 0.42, 0.20, 'sawtooth');
    }

    win() {
      [392, 523, 659, 784].forEach((note, i) => {
        this.tone(note, note * 1.015, 0.22, 0.14, 'triangle', i * 0.14);
      });
    }

    lose() {
      [330, 262, 196].forEach((note, i) => {
        this.tone(note, note * 0.7, 0.28, 0.18, 'sawtooth', i * 0.18);
      });
    }

    step() {
      if (!this.ready) return;
      const now = this.context.currentTime;
      if (now - this.lastStep < 0.22) return;
      this.lastStep = now;
      this.noise(0.055, 0.07, 330);
    }
  }

  window.GameAudio = GameAudio;
})();
