import type { Suit } from '../../engine/types';

/** Rows of '#'/'.'; every sprite is drawn on an integer pixel grid. */
export const SUIT_BITMAPS: Record<Suit, string[]> = {
  s: ['....#....', '...###...', '..#####..', '.#######.', '#########', '#########', '#########', '...###...', '..#####..'],
  h: ['.###.###.', '#########', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  d: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  c: ['...###...', '..#####..', '..#####..', '...###...', '.###.###.', '#########', '#########', '.##.#.##.', '...###...'],
};

/** One SVG path per character of a grid ('.' is transparent). */
export function gridPaths(rows: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') out[ch] = (out[ch] ?? '') + `M${x} ${y}h1v1h-1z`;
  }));
  return out;
}

export const HAIR = ['#2b2118', '#6b3f1d', '#c98a2b', '#8a8a8a', '#a8322d', '#3b5bdb'];
export const SKIN = ['#f1c9a5', '#d9a273', '#8d5a3b'];
export const SHIRT = ['#3f8f5b', '#c94f4f', '#3b5bdb', '#8a4fd9', '#e0a030', '#2f9ea8'];
const HAIR_TOP: string[][] = [
  ['..hhhh..', '.hhhhhh.', '.hssssh.'],
  ['.h.hh.h.', '.hhhhhh.', '.hhhhhh.'],
  ['..hhhh..', '.hhhhhh.', 'hhsssshh'],
  ['..hhhh..', 'hhhhhhhh', '.ssssss.'],
];
const FACE = ['.ssssss.', '.sessse.', '.ssssss.', '..smms..', '.tttttt.'];

/** 8x8 avatar rows for a bot avatar index (0..11); -1 is the player's own sprite (cap + star-free headband look). */
export function avatarGrid(index: number): string[] {
  if (index < 0) return ['..cccc..', '.cccccc.', '.ssssss.', ...FACE.slice(0, 4).map((r) => r), '.tttttt.'].slice(0, 8).map((r, i) => (i === 3 ? '.sessse.' : i === 4 ? '.ssssss.' : r));
  return [...HAIR_TOP[index % 4]!, ...FACE];
}
/** Palette letters used by avatarGrid for this index. */
export function avatarColors(index: number): Record<string, string> {
  if (index < 0) return { c: '#f2c14e', s: SKIN[0]!, e: '#111', m: '#a8322d', t: '#2f9ea8' };
  return { h: HAIR[index % 6]!, s: SKIN[index % 3]!, e: '#111', m: '#a8322d', t: SHIRT[(index * 5) % 6]! };
}

export const CHIP_DENOMS = [1000, 500, 100, 25, 5, 1] as const;
/** Colors of a top-view chip: body, edge stripes and the lighter center. Every denomination has its own color. */
export const CHIP_STYLE: Record<number, { body: string; rim: string; light: string }> = {
  1: { body: '#cfd4e4', rim: '#6f7899', light: '#ffffff' },
  5: { body: '#d94f4f', rim: '#f4f1de', light: '#f59a9a' },
  25: { body: '#2f9a5a', rim: '#f4f1de', light: '#8fe0a8' },
  100: { body: '#2b3050', rim: '#f2c14e', light: '#7b84c4' },
  500: { body: '#8a4fd9', rim: '#f4f1de', light: '#c39bf5' },
  1000: { body: '#e0a030', rim: '#6b3d0c', light: '#ffe08a' },
};
export const CHIP_W = 15, CHIP_H = 17;
/**
 * A chip seen from above with a little edge thickness (15x17):
 * o outline, r edge stripes (12 notches), l light ring, b body, c center, s side/edge.
 */
export function chipGrid(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < CHIP_H; y++) {
    let row = '';
    for (let x = 0; x < CHIP_W; x++) {
      const dx = x - 7, dy = y - 7, d = Math.hypot(dx, dy), d2 = Math.hypot(dx, y - 9);
      if (d <= 7.3) {
        if (d > 6.3) row += 'o';
        else if (d > 4.4) row += Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 12) % 2 === 0 ? 'r' : 'b';
        else if (d > 3.6) row += 'l';
        else if (d > 1.6) row += 'b';
        else row += 'c';
      } else if (d2 <= 7.3) row += d2 > 6.3 ? 'o' : 's';
      else row += '.';
    }
    rows.push(row);
  }
  return rows;
}
export const CHIP_GRID = chipGrid();
/** Darkens a #rrggbb color (factor 0..1). */
export function shade(hex: string, f: number): string {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('')}`;
}
/** Fill color for each grid character of a chip of this denomination. */
export function chipColor(denom: number, ch: string): string {
  const st = CHIP_STYLE[denom] ?? CHIP_STYLE[1]!;
  return ch === 'o' ? '#14121f' : ch === 'r' ? st.rim : ch === 'l' || ch === 'c' ? st.light : ch === 's' ? shade(st.body, 0.6) : st.body;
}

/** Greedy chip breakdown, largest denomination first. */
export function chipBreakdown(amount: number): { denom: number; count: number }[] {
  const out: { denom: number; count: number }[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of CHIP_DENOMS) {
    const count = Math.floor(rest / d);
    if (count > 0) { out.push({ denom: d, count }); rest -= count * d; }
  }
  return out;
}
