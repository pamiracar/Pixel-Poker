/** Palette values mirrored from styles.css (a test keeps both in sync) plus WCAG contrast helpers. */
export const PALETTE = {
  bg: '#14121f', panel: '#26233a', ink: '#f4f1de', felt: '#1f6b46', felt2: '#1a5c3c', wood: '#6b4226',
  gold: '#f2c14e', red: '#c94f4f', cardRed: '#b3261e', blue: '#3b5bdb',
} as const;

const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const luminance = (hex: string): number => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** Color of `fg` drawn at `alpha` opacity over `bg` (for the dimmed "muted" text). */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg), b = rgb(bg);
  return `#${f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}
