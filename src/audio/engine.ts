import { MUSIC, midiToFreq, stepSeconds } from './music';
import { SOUNDS, type SoundName } from './sounds';

/** The small slice of the Web Audio API we use, so the engine can be tested with a fake context. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
export interface NodeLike { connect(dest: unknown): unknown }
export interface GainLike extends NodeLike { gain: AudioParamLike }
export interface OscLike extends NodeLike { type: string; frequency: AudioParamLike; start(t?: number): void; stop(t?: number): void }
export interface BufferLike { getChannelData(c: number): Float32Array }
export interface SourceLike extends NodeLike { buffer: unknown; start(t?: number): void; stop(t?: number): void }
export interface AudioContextLike {
  currentTime: number; sampleRate: number; state: string; destination: unknown;
  resume(): unknown; createGain(): GainLike; createOscillator(): OscLike;
  createBuffer(channels: number, length: number, rate: number): BufferLike; createBufferSource(): SourceLike;
}

export interface AudioSettings { sfxOn: boolean; sfxVolume: number; musicOn: boolean; musicVolume: number } // volumes 0..100
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sfxOn: true, sfxVolume: 70, musicOn: true, musicVolume: 25 };

/** Perceptual volume curve: slider 0..100 -> gain 0..1. */
export const volumeToGain = (v: number): number => Math.pow(Math.max(0, Math.min(100, v)) / 100, 2);

/**
 * Chiptune audio engine. Browsers block audio before a user gesture, so no AudioContext
 * is created until `unlock()` is called from a click/key handler; before that every call is a no-op.
 * Effects and music have separate gains (and on/off switches) below one master gain.
 */
export class AudioEngine {
  private ctx: AudioContextLike | null = null;
  private sfxGain: GainLike | null = null;
  private musicGain: GainLike | null = null;
  private noise: BufferLike | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(private readonly factory: () => AudioContextLike) {}

  get unlocked(): boolean { return this.ctx !== null; }
  get musicRunning(): boolean { return this.timer !== null; }
  /** Current gain values (0..1) of the effects and music buses. */
  levels(): { sfx: number; music: number } { return { sfx: this.sfxGain?.gain.value ?? 0, music: this.musicGain?.gain.value ?? 0 }; }

  /** Call from the first user interaction (pointer/key). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      let ctx: AudioContextLike;
      try { ctx = this.factory(); } catch { return; } // no Web Audio support: stay silent, never break the game
      const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      this.sfxGain = ctx.createGain(); this.sfxGain.connect(master);
      this.musicGain = ctx.createGain(); this.musicGain.connect(master);
      this.ctx = ctx;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.syncMusic();
  }

  setSettings(s: AudioSettings): void {
    this.settings = { ...s };
    this.applyVolumes();
    this.syncMusic();
  }

  private applyVolumes(): void {
    if (!this.sfxGain || !this.musicGain) return;
    this.sfxGain.gain.value = this.settings.sfxOn ? volumeToGain(this.settings.sfxVolume) : 0;
    this.musicGain.gain.value = this.settings.musicOn ? volumeToGain(this.settings.musicVolume) : 0;
  }

  private envelope(dest: GainLike, t: number, dur: number, vol: number): GainLike {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }
  private tone(dest: GainLike, wave: string, f0: number, f1: number | undefined, t: number, dur: number, vol: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) osc.frequency.linearRampToValueAtTime(f1, t + dur);
    osc.connect(this.envelope(dest, t, dur, vol));
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  private noiseBurst(dest: GainLike, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.3)), ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.connect(this.envelope(dest, t, dur, vol));
    src.start(t); src.stop(t + dur);
  }

  /** Plays a sound effect (optionally delayed). No-op before unlock or when effects are off. */
  play(name: SoundName, delaySec = 0): void {
    if (!this.ctx || !this.sfxGain || !this.settings.sfxOn) return;
    const t0 = this.ctx.currentTime + delaySec;
    for (const s of SOUNDS[name].steps) {
      if (s.kind === 'tone') this.tone(this.sfxGain, s.wave, s.freq, s.endFreq, t0 + s.start, s.dur, s.vol);
      else this.noiseBurst(this.sfxGain, t0 + s.start, s.dur, s.vol);
    }
  }

  private syncMusic(): void {
    const want = this.ctx !== null && this.settings.musicOn && this.settings.musicVolume > 0;
    if (want && !this.timer) this.startMusic();
    else if (!want && this.timer) this.stopMusic();
  }
  private startMusic(): void {
    if (!this.ctx || this.timer) return;
    this.step = 0; this.nextTime = this.ctx.currentTime;
    this.tickMusic();
    this.timer = setInterval(() => this.tickMusic(), 100);
  }
  stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  /** Schedules the next notes slightly ahead of the audio clock (look-ahead scheduling). */
  tickMusic(): void {
    if (!this.ctx || !this.musicGain || !this.settings.musicOn) return;
    const dur = stepSeconds();
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.4) {
      const lead = MUSIC.lead[this.step], bass = MUSIC.bass[this.step];
      if (lead != null) this.tone(this.musicGain, 'square', midiToFreq(lead), undefined, this.nextTime, dur * 0.8, 0.07);
      if (bass != null) this.tone(this.musicGain, 'triangle', midiToFreq(bass), undefined, this.nextTime, dur * 1.8, 0.14);
      this.step = (this.step + 1) % MUSIC.steps;
      this.nextTime += dur;
    }
  }
}

/** App-wide instance. Constructing it creates no AudioContext (that waits for the first user gesture). */
export const audio = new AudioEngine(() => {
  const Ctor = (window as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown });
  const C = Ctor.AudioContext ?? Ctor.webkitAudioContext;
  if (!C) throw new Error('Web Audio is not supported in this browser');
  return new C() as AudioContextLike;
});
