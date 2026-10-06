// Sound, screen flash and shake for accepted gestures. Output only: no audio is captured.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const frequency = semitones => 523.25 * Math.pow(2, semitones / 12);

export class Sfx {
  constructor() { this.enabled = true; this.context = null; }

  // Browsers only start audio after a user gesture, so create it from one.
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { this.context = null; }
  }

  get ready() { return this.enabled && this.context !== null && this.context.state === 'running'; }

  tone(freq, start, duration, type, volume, slideTo) {
    const { context } = this;
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain); gain.connect(context.destination);
    osc.start(start); osc.stop(start + duration + 0.03);
  }

  noise(start, duration, volume) {
    const { context } = this;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 1400; gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    source.start(start);
  }

  play(fn) {
    if (!this.ready) return;
    try { fn(this.context.currentTime); } catch { /* Audio is optional. */ }
  }

  // Low thump plus a rising run of notes: the run gets longer with the combo.
  hit(combo = 1, { max = false } = {}) {
    this.play(t => {
      this.tone(170, t, 0.28, 'sine', 0.35, 38);
      this.noise(t, 0.2, 0.18);
      if (max) {
        // A second thump, a rising sweep and a longer run of notes.
        this.tone(120, t + 0.12, 0.3, 'sine', 0.35, 30);
        this.tone(220, t, 0.5, 'sawtooth', 0.05, 1760);
        this.noise(t + 0.12, 0.25, 0.14);
      }
      const notes = 3 + Math.min(combo, 6) + (max ? 4 : 0);
      for (let i = 0; i < notes; i++) this.tone(frequency(PENTATONIC[i]), t + 0.04 + i * 0.055, 0.2, i % 2 ? 'triangle' : 'square', 0.08);
    });
  }

  levelUp() {
    this.play(t => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(frequency(s), t + i * 0.07, 0.25, 'square', 0.08)));
  }

  badge() {
    this.play(t => { this.tone(frequency(12), t, 0.12, 'triangle', 0.11); this.tone(frequency(19), t + 0.09, 0.22, 'triangle', 0.11); });
  }
}

export class Impact {
  constructor(flash, shakeTargets) {
    this.flash = flash;
    this.targets = shakeTargets;
    this.enabled = true;
    this.animations = [];
  }

  // strength is 1 to 5. Flash and shake are skipped when motion is reduced.
  hit(strength = 3, { max = false } = {}) {
    if (!this.enabled || reducedMotion()) return;
    this.cancel();
    // One flash per hit, never a strobe. Max mode is brighter and longer, not faster.
    this.animations.push(this.flash.animate([{ opacity: max ? 0.9 : 0.25 + strength * 0.08 }, { opacity: 0 }], { duration: max ? 600 : 420, easing: 'ease-out' }));
    const amplitude = (3 + strength * 2.5) * (max ? 1.8 : 1);
    const keyframes = Array.from({ length: 9 }, (_, i) => {
      const decay = 1 - i / 8;
      return { translate: i === 8 ? '0px 0px' : `${((Math.random() * 2 - 1) * amplitude * decay).toFixed(1)}px ${((Math.random() * 2 - 1) * amplitude * decay).toFixed(1)}px` };
    });
    for (const target of this.targets) this.animations.push(target.animate(keyframes, { duration: max ? 520 : 360, easing: 'linear' }));
  }

  cancel() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }
}
