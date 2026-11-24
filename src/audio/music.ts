/** Light looping chiptune background music (A minor, Am-F-C-G), generated from data. */
export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const BARS = [
  { root: 45, chord: [57, 60, 64] }, { root: 41, chord: [53, 57, 60] },
  { root: 48, chord: [55, 60, 64] }, { root: 43, chord: [55, 59, 62] },
];
const STEPS_PER_BAR = 8; // eighth notes

export const MUSIC = {
  bpm: 108,
  steps: BARS.length * STEPS_PER_BAR,
  bass: BARS.flatMap((b) => Array.from({ length: STEPS_PER_BAR }, (_, i): number | null => (i % 2 === 0 ? b.root : null))),
  lead: BARS.flatMap((b, bi) => Array.from({ length: STEPS_PER_BAR }, (_, i): number | null => {
    if (i % 4 === 3 || (bi % 2 === 1 && i === 6)) return null;                 // rests keep it light
    return b.chord[(i + bi) % 3]! + 12;
  })),
};
export const stepSeconds = (): number => 60 / MUSIC.bpm / 2;
