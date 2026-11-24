export interface Preset { label: string; to: number }

/** Snaps a bet to the chip step, always keeping the exact minimum and maximum (all-in) reachable. */
export function snapBet(v: number, min: number, max: number, step: number): number {
  const c = Math.max(min, Math.min(max, Math.round(v)));
  if (c === min || c === max) return c;
  return Math.max(min, Math.min(max, Math.round(c / step) * step));
}

/**
 * Quick bet sizes the way poker clients offer them: multiples of the big blind for the first raise,
 * multiples of the current bet when re-raising preflop, and pot fractions after the flop.
 */
export function sizingPresets(o: { phase: string; currentBet: number; myBet: number; bigBlind: number; pot: number; min: number; max: number; step: number }): Preset[] {
  const toCall = Math.max(0, o.currentBet - o.myBet);
  const raw: Preset[] = o.phase === 'PREFLOP'
    ? (o.currentBet <= o.bigBlind
      ? [2.5, 3, 4].map((m) => ({ label: `${m}x`, to: m * o.bigBlind }))
      : [2, 3, 4].map((m) => ({ label: `${m}x`, to: m * o.currentBet })))
    : [[1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [1, 'POT']].map(([f, label]) => ({ label: label as string, to: o.currentBet + (f as number) * (o.pot + toCall) }));
  const out: Preset[] = [];
  for (const p of raw) {
    const to = snapBet(p.to, o.min, o.max, o.step);
    if (to > o.min && to < o.max && !out.some((x) => x.to === to)) out.push({ label: p.label, to });
  }
  return out;
}
