/** Chiptune sound effects as pure data: synthesized at play time with Web Audio, no audio files. */
export type SoundName = 'deal' | 'chip' | 'check' | 'fold' | 'raise' | 'allin' | 'win' | 'lose' | 'turn';
export type SoundStep =
  | { kind: 'tone'; wave: 'square' | 'triangle' | 'sawtooth'; freq: number; endFreq?: number; start: number; dur: number; vol: number }
  | { kind: 'noise'; start: number; dur: number; vol: number };
export interface SoundDef { steps: SoundStep[] }

const tone = (wave: 'square' | 'triangle' | 'sawtooth', freq: number, start: number, dur: number, vol: number, endFreq?: number): SoundStep =>
  ({ kind: 'tone', wave, freq, start, dur, vol, ...(endFreq !== undefined ? { endFreq } : {}) });
const noise = (start: number, dur: number, vol: number): SoundStep => ({ kind: 'noise', start, dur, vol });

export const SOUNDS: Record<SoundName, SoundDef> = {
  deal: { steps: [noise(0, 0.05, 0.25), tone('square', 1800, 0, 0.04, 0.08, 900)] },
  check: { steps: [tone('square', 220, 0, 0.04, 0.2), noise(0, 0.02, 0.15)] },
  fold: { steps: [tone('triangle', 330, 0, 0.18, 0.25, 110)] },
  chip: { steps: [tone('square', 1400, 0, 0.04, 0.12), tone('square', 1900, 0.05, 0.05, 0.12), noise(0, 0.03, 0.12)] },
  raise: { steps: [tone('square', 523, 0, 0.07, 0.18), tone('square', 659, 0.07, 0.07, 0.18), tone('square', 784, 0.14, 0.12, 0.18)] },
  allin: { steps: [392, 523, 659, 784].map((f, i) => tone('square', f, i * 0.07, 0.07, 0.18))
    .concat([tone('square', 1047, 0.28, 0.2, 0.2), noise(0.28, 0.2, 0.2)]) },
  win: { steps: [tone('square', 523, 0, 0.1, 0.2), tone('square', 659, 0.1, 0.1, 0.2), tone('square', 784, 0.2, 0.1, 0.2),
    tone('square', 1047, 0.3, 0.4, 0.2), tone('triangle', 262, 0.3, 0.4, 0.2)] },
  lose: { steps: [tone('triangle', 392, 0, 0.15, 0.25), tone('triangle', 330, 0.15, 0.15, 0.25), tone('triangle', 262, 0.3, 0.35, 0.25)] },
  turn: { steps: [tone('square', 880, 0, 0.06, 0.15), tone('square', 1320, 0.08, 0.09, 0.15)] },
};

export function soundDuration(def: SoundDef): number {
  return Math.max(...def.steps.map((s) => s.start + s.dur));
}
