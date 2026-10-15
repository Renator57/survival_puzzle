// Musik und Soundeffekte – komplett zur Laufzeit erzeugt (Web Audio API), keine Audiodateien.

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Düstere Akkordfolge in d-Moll: Dm – B♭ – Gm – A
const PROGRESSION = [
  { root: 38, notes: [50, 53, 57, 60, 62] },
  { root: 34, notes: [50, 53, 58, 62, 65] },
  { root: 43, notes: [50, 55, 58, 62, 67] },
  { root: 45, notes: [49, 52, 57, 61, 64] },
];
const BPM = 68;
const STEP = 60 / BPM / 2;
const STEPS_PER_CHORD = 16;
const ARP = [0, 2, 1, 3, null, 2, 1, null, 0, 3, 4, 3, null, 1, null, 2];
const LOOKAHEAD = 0.3;
const SETTINGS_KEY = 'survival-puzzle-settings';

export interface AudioSettings {
  music: number;
  sfx: number;
}

function loadSettings(): AudioSettings {
  try {
    return { music: 0.5, sfx: 0.8, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { music: 0.5, sfx: 0.8 };
  }
}

class AudioEngine {
  settings = loadSettings();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private padFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  // Browser erlauben Ton erst nach einer Nutzeraktion – beim ersten Tippen aufrufen.
  unlock() {
    if (!this.ctx) this.setup();
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
    if (this.settings.music > 0) this.startMusic();
  }

  setVolume(kind: keyof AudioSettings, value: number) {
    this.settings[kind] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'sfx') this.sfxGain.gain.setTargetAtTime(value, t, 0.05);
    if (kind === 'music') {
      if (value > 0) this.startMusic();
      this.musicGain.gain.setTargetAtTime(value * 0.45, t, 0.3);
      if (value === 0) this.stopMusic();
    }
  }

  private setup() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4);
    const rv = ctx.createGain();
    rv.gain.value = 0.55;
    this.reverb.connect(rv).connect(this.master);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.reverb);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.reverb);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.settings.sfx;
    this.sfxGain.connect(this.master);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.04;
    depth.gain.value = 350;
    lfo.connect(depth).connect(this.padFilter.frequency);
    lfo.start();
    this.padFilter.connect(this.musicGain);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------- Musik ----------
  private startMusic() {
    if (!this.ctx || this.timer !== null || this.settings.music === 0) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicGain.gain.setTargetAtTime(this.settings.music * 0.45, this.ctx.currentTime, 1);
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stopMusic() {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.1;
      return;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step += 1;
    }
  }

  private playStep(step: number, t: number) {
    const chord = PROGRESSION[Math.floor(step / STEPS_PER_CHORD) % PROGRESSION.length];
    const s = step % STEPS_PER_CHORD;
    const cycle = Math.floor(step / (STEPS_PER_CHORD * PROGRESSION.length));
    if (s === 0) this.pad(chord.notes.slice(0, 4), t, STEP * STEPS_PER_CHORD);
    if (s === 0 || s === 8) this.bass(chord.root, t, STEP * 8);
    if (s % 4 === 0) this.heartbeat(t, s % 8 === 0 ? 1 : 0.6); // dumpfer Herzschlag
    const idx = ARP[s];
    if (cycle > 0 && idx !== null && Math.random() > 0.15) this.pluck(chord.notes[idx] + 12, t, 0.06);
  }

  private pad(notes: number[], t: number, dur: number) {
    for (const n of notes) {
      for (const detune of [-9, 9]) {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sawtooth';
        o.frequency.value = freq(n);
        o.detune.value = detune;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.02, t + 2.5);
        g.gain.setValueAtTime(0.02, t + dur - 0.5);
        g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
        o.connect(g).connect(this.padFilter);
        o.start(t);
        o.stop(t + dur + 2.6);
      }
    }
  }

  private bass(note: number, t: number, dur: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = 'triangle';
    o.frequency.value = freq(note);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private heartbeat(t: number, level: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(0.32 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.3);
  }

  private pluck(note: number, t: number, level: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = freq(note);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(this.musicGain);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 1);
  }

  // ---------- Soundeffekte ----------
  private ready() {
    return !!this.ctx && this.ctx.state === 'running' && this.settings.sfx > 0;
  }

  private tone(note: number, delay = 0, { type = 'triangle' as OscillatorType, level = 0.18, decay = 0.25, reverb = false } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(note);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.sfxGain);
    if (reverb) g.connect(this.reverb);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private hiss(delay: number, opts: { from?: number; to?: number; dur?: number; level?: number; type?: BiquadFilterType } = {}) {
    const { from = 1800, dur = 0.06, level = 0.15, type = 'bandpass' } = opts;
    const to = opts.to ?? from;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private sweep(from: number, to: number, dur: number, level: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ui() {
    if (this.ready()) this.tone(84, 0, { type: 'sine', level: 0.06, decay: 0.06 });
  }
  swap() {
    if (this.ready()) this.hiss(0, { from: 900, to: 2500, dur: 0.12, level: 0.08 });
  }
  invalid() {
    if (!this.ready()) return;
    this.tone(50, 0, { type: 'square', level: 0.05, decay: 0.12 });
    this.tone(47, 0.1, { type: 'square', level: 0.05, decay: 0.15 });
  }
  // Steine abräumen – mit jeder Kombo höher
  clear(combo: number) {
    if (!this.ready()) return;
    const base = 72 + Math.min(combo, 6) * 2;
    this.tone(base, 0, { level: 0.12, decay: 0.2 });
    this.tone(base + 7, 0.05, { level: 0.1, decay: 0.25, reverb: true });
    this.hiss(0, { from: 3000, dur: 0.05, level: 0.06 });
  }
  hit() {
    if (!this.ready()) return;
    this.sweep(300 + Math.random() * 120, 90, 0.1, 0.22);
    this.hiss(0, { from: 1200, dur: 0.06, level: 0.12 });
  }
  zombie() {
    if (!this.ready()) return;
    this.sweep(120, 45, 0.35, 0.4, 'sawtooth');
    this.hiss(0, { from: 400, to: 150, dur: 0.3, level: 0.25, type: 'lowpass' });
  }
  skill() {
    if (!this.ready()) return;
    [62, 69, 74, 81].forEach((n, i) => this.tone(n, i * 0.05, { type: 'sawtooth', level: 0.07, decay: 0.5, reverb: true }));
    this.hiss(0, { from: 200, to: 6000, dur: 0.4, level: 0.15, type: 'lowpass' });
  }
  heal() {
    if (this.ready()) [76, 81, 88].forEach((n, i) => this.tone(n, i * 0.08, { type: 'sine', level: 0.1, decay: 0.6, reverb: true }));
  }
  wave() {
    if (!this.ready()) return;
    this.tone(38, 0, { type: 'sawtooth', level: 0.15, decay: 0.8 });
    this.tone(45, 0.2, { type: 'sawtooth', level: 0.12, decay: 0.8 });
  }
  victory() {
    if (this.ready()) [62, 66, 69, 74, 78, 81].forEach((n, i) => this.tone(n, i * 0.09, { type: 'triangle', level: 0.14, decay: 0.9, reverb: true }));
  }
  defeat() {
    if (this.ready()) [62, 58, 55, 50].forEach((n, i) => this.tone(n, i * 0.22, { type: 'sawtooth', level: 0.08, decay: 0.7, reverb: true }));
  }
  build() {
    if (!this.ready()) return;
    [0, 0.12, 0.24].forEach((d) => this.hiss(d, { from: 2500, dur: 0.05, level: 0.18 }));
    this.tone(67, 0.3, { level: 0.1, decay: 0.3 });
  }
  reward() {
    if (this.ready()) [79, 83, 86, 91].forEach((n, i) => this.tone(n, i * 0.06, { type: 'sine', level: 0.1, decay: 0.4, reverb: true }));
  }
  // Beschwörung: Aufbau, dann Glanz je nach bester Seltenheit (0–3)
  summon(best: number) {
    if (!this.ready()) return;
    this.hiss(0, { from: 150, to: 5000, dur: 1.2, level: 0.2, type: 'lowpass' });
    const chord = best >= 2 ? [74, 78, 81, 86, 90] : best === 1 ? [69, 72, 76, 81] : [67, 71, 74];
    chord.forEach((n, i) => this.tone(n, 1.2 + i * 0.07, { type: 'sine', level: 0.12, decay: 1.4, reverb: true }));
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    }
    return buf;
  }
}

export const audio = new AudioEngine();
