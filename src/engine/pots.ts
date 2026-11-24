/** Main pot / side pot construction and payout. Pure functions, no game state. */
export interface Contribution { id: number; amount: number; folded: boolean }
export interface Pot { amount: number; eligible: number[] }
export interface PotResult extends Pot { winners: number[] }

/**
 * Builds main + side pots from each player's total contribution to the hand.
 * Levels come from non-folded contributions only; folded chips are dead money
 * that fills the pots they reach.
 */
export function buildPots(cs: readonly Contribution[]): Pot[] {
  const levels = [...new Set(cs.filter((c) => !c.folded && c.amount > 0).map((c) => c.amount))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (const c of cs) amount += Math.max(0, Math.min(c.amount, lv) - prev);
    pots.push({ amount, eligible: cs.filter((c) => !c.folded && c.amount >= lv).map((c) => c.id) });
    prev = lv;
  }
  // Dead money above the top live level (normally refunded before this point).
  const extra = cs.reduce((s, c) => s + Math.max(0, c.amount - prev), 0);
  const last = pots[pots.length - 1];
  if (extra > 0 && last) last.amount += extra;
  return pots;
}

/**
 * Awards each pot to its best-scoring eligible player(s).
 * `seatOrder` lists player ids starting left of the dealer: odd chips go one at
 * a time to winners in that order.
 */
export function distributePots(pots: readonly Pot[], scores: ReadonlyMap<number, number>, seatOrder: readonly number[]):
  { payouts: Map<number, number>; results: PotResult[] } {
  const payouts = new Map<number, number>();
  const results: PotResult[] = [];
  for (const pot of pots) {
    const contenders = pot.eligible.filter((id) => scores.has(id));
    const best = Math.max(...contenders.map((id) => scores.get(id)!));
    const winners = contenders.filter((id) => scores.get(id) === best)
      .sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    const rem = pot.amount - share * winners.length;
    winners.forEach((id, i) => payouts.set(id, (payouts.get(id) ?? 0) + share + (i < rem ? 1 : 0)));
    results.push({ ...pot, winners });
  }
  return { payouts, results };
}
