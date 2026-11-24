import { afterEach, describe, expect, it } from 'vitest';
import { AudioEngine, DEFAULT_AUDIO_SETTINGS, volumeToGain, type AudioContextLike, type AudioSettings } from '../src/audio/engine';
import { SOUNDS, soundDuration, type SoundName } from '../src/audio/sounds';
import { MUSIC, midiToFreq, stepSeconds } from '../src/audio/music';
import { soundsForTransition, type AudioSnapshot } from '../src/audio/events';

class P { value = 0; setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeCtx implements AudioContextLike {
  currentTime = 0; sampleRate = 8000; state = 'suspended'; destination = {}; resumed = 0;
  gains: { gain: P; connect(): void }[] = []; oscs: { type: string; frequency: P; connect(): void; start(): void; stop(): void }[] = [];
  sources: { buffer: unknown; connect(): void; start(): void; stop(): void }[] = [];
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  createGain() { const g = { gain: new P(), connect() {} }; this.gains.push(g); return g; }
  createOscillator() { const o = { type: '', frequency: new P(), connect() {}, start() {}, stop() {} }; this.oscs.push(o); return o; }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { const s = { buffer: null as unknown, connect() {}, start() {}, stop() {} }; this.sources.push(s); return s; }
}
const quiet: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS, musicOn: false };
let engines: AudioEngine[] = [];
function make(settings: AudioSettings = quiet) {
  const created: FakeCtx[] = [];
  const engine = new AudioEngine(() => { const c = new FakeCtx(); created.push(c); return c; });
  engine.setSettings(settings);
  engines.push(engine);
  return { engine, created, ctx: () => created[0]! };
}
afterEach(() => { engines.forEach((e) => e.stopMusic()); engines = []; });

describe('autoplay policy', () => {
  it('creates no AudioContext and plays nothing before the first user gesture', () => {
    const { engine, created } = make();
    engine.play('win');
    engine.tickMusic();
    expect(created).toHaveLength(0);
    expect(engine.unlocked).toBe(false);
  });
  it('unlock creates the context once and resumes a suspended context', () => {
    const { engine, created, ctx } = make();
    engine.unlock(); engine.unlock();
    expect(created).toHaveLength(1);
    expect(ctx().resumed).toBe(1);
    expect(engine.unlocked).toBe(true);
  });
});

describe('effects', () => {
  it('synthesizes each sound from oscillators and noise buffers', () => {
    const { engine, ctx } = make();
    engine.unlock();
    engine.play('raise');
    expect(ctx().oscs).toHaveLength(3);
    engine.play('deal');
    expect(ctx().sources).toHaveLength(1);
    expect(ctx().oscs.length).toBe(4);
    for (const name of Object.keys(SOUNDS) as SoundName[]) engine.play(name);
  });
  it('plays nothing when effects are switched off', () => {
    const { engine, ctx } = make({ ...quiet, sfxOn: false });
    engine.unlock();
    const before = ctx().oscs.length + ctx().sources.length;
    engine.play('win');
    expect(ctx().oscs.length + ctx().sources.length).toBe(before);
    expect(engine.levels().sfx).toBe(0);
  });
  it('effects and music have separate volumes and switches', () => {
    const { engine } = make({ sfxOn: true, sfxVolume: 50, musicOn: false, musicVolume: 20 });
    engine.unlock();
    expect(engine.levels()).toEqual({ sfx: volumeToGain(50), music: 0 });
    engine.setSettings({ sfxOn: false, sfxVolume: 50, musicOn: true, musicVolume: 20 });
    expect(engine.levels()).toEqual({ sfx: 0, music: volumeToGain(20) });
    engine.setSettings({ sfxOn: true, sfxVolume: 100, musicOn: true, musicVolume: 0 });
    expect(engine.levels()).toEqual({ sfx: 1, music: 0 });
  });
  it('volume curve is monotonic, 0 -> 0 and 100 -> 1, and clamps', () => {
    expect(volumeToGain(0)).toBe(0); expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(40)).toBeLessThan(volumeToGain(60));
    expect(volumeToGain(-5)).toBe(0); expect(volumeToGain(500)).toBe(1);
  });
  it('default volumes are moderate and music is quieter than effects', () => {
    expect(DEFAULT_AUDIO_SETTINGS.sfxVolume).toBeLessThan(100);
    expect(DEFAULT_AUDIO_SETTINGS.musicVolume).toBeLessThan(DEFAULT_AUDIO_SETTINGS.sfxVolume);
  });
});

describe('music', () => {
  it('starts only after unlock, schedules ahead of the clock, and stops', () => {
    const { engine, ctx } = make({ ...DEFAULT_AUDIO_SETTINGS, musicOn: true });
    expect(engine.musicRunning).toBe(false);
    engine.unlock();
    expect(engine.musicRunning).toBe(true);
    const first = ctx().oscs.length;
    expect(first).toBeGreaterThan(0);
    ctx().currentTime += 1;
    engine.tickMusic();
    expect(ctx().oscs.length).toBeGreaterThan(first);
    engine.stopMusic();
    expect(engine.musicRunning).toBe(false);
  });
  it('can be switched off and on again while playing', () => {
    const { engine } = make({ ...DEFAULT_AUDIO_SETTINGS, musicOn: true });
    engine.unlock();
    engine.setSettings({ ...DEFAULT_AUDIO_SETTINGS, musicOn: false });
    expect(engine.musicRunning).toBe(false);
    engine.setSettings({ ...DEFAULT_AUDIO_SETTINGS, musicOn: true });
    expect(engine.musicRunning).toBe(true);
  });
  it('music data is a well-formed loop in an audible range', () => {
    expect(MUSIC.bass).toHaveLength(MUSIC.steps);
    expect(MUSIC.lead).toHaveLength(MUSIC.steps);
    expect(MUSIC.lead.some((n) => n === null)).toBe(true);
    for (const n of [...MUSIC.lead, ...MUSIC.bass]) if (n !== null) { expect(midiToFreq(n)).toBeGreaterThan(40); expect(midiToFreq(n)).toBeLessThan(2000); }
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(stepSeconds()).toBeGreaterThan(0.2);
  });
});

describe('sound definitions', () => {
  it('every game sound exists, is short, audible and not clipping', () => {
    const names: SoundName[] = ['deal', 'chip', 'check', 'fold', 'raise', 'allin', 'win', 'lose', 'turn'];
    for (const n of names) {
      const d = SOUNDS[n];
      expect(d.steps.length, n).toBeGreaterThan(0);
      expect(soundDuration(d), n).toBeLessThan(1.2);
      for (const s of d.steps) {
        expect(s.vol).toBeGreaterThan(0); expect(s.vol).toBeLessThanOrEqual(0.3);
        expect(s.dur).toBeGreaterThan(0);
        if (s.kind === 'tone') { expect(s.freq).toBeGreaterThan(50); expect(s.freq).toBeLessThan(8000); }
      }
    }
  });
});

describe('which sound for which game event', () => {
  const base: AudioSnapshot = { hand: 1, phase: 'PREFLOP', boardLen: 0, toAct: 3, actions: [], humanPayout: 0, humanDealtIn: true, humanFolded: false };
  it('new hand deals cards, and signals the human turn', () => {
    expect(soundsForTransition(null, base)).toEqual(['deal']);
    expect(soundsForTransition(base, { ...base, hand: 2, toAct: 0 })).toEqual(['deal', 'turn']);
  });
  it('maps each action to its sound', () => {
    const t = (a: AudioSnapshot['actions'][number]) => soundsForTransition(base, { ...base, toAct: 4, actions: [a] });
    expect(t('fold')).toEqual(['fold']); expect(t('check')).toEqual(['check']); expect(t('call')).toEqual(['chip']);
    expect(t('bet')).toEqual(['raise']); expect(t('raise')).toEqual(['raise']); expect(t('allin')).toEqual(['allin']);
  });
  it('new board cards play the deal sound once, even for a multi-street runout', () => {
    expect(soundsForTransition(base, { ...base, boardLen: 3 })).toEqual(['deal']);
    expect(soundsForTransition(base, { ...base, boardLen: 5 })).toEqual(['deal']);
  });
  it('turn alert only on the transition to the human', () => {
    expect(soundsForTransition({ ...base, toAct: 0 }, { ...base, toAct: 0 })).toEqual([]);
    expect(soundsForTransition(base, { ...base, toAct: 0 })).toEqual(['turn']);
  });
  it('win, lose, and silence for a fold', () => {
    const pay = { ...base, phase: 'PAYOUT' as const, toAct: -1 };
    expect(soundsForTransition(base, { ...pay, humanPayout: 120 })).toEqual(['win']);
    expect(soundsForTransition(base, pay)).toEqual(['lose']);
    expect(soundsForTransition(base, { ...pay, humanFolded: true })).toEqual([]);
    expect(soundsForTransition(pay, pay)).toEqual([]);
  });
  it('nothing changes, nothing plays', () => expect(soundsForTransition(base, base)).toEqual([]));
});
