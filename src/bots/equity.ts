import type { Card } from '../engine/types';
import { createDeck, type RandomInt } from '../engine/deck';
import { evaluateBest } from '../engine/handEvaluator';

const cardKey = (c: Card): string => `${c.rank}${c.suit}`;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Chen-formula starting hand strength, normalised to 0..1 (AA = 1, 72o = 0). */
export function preflopStrength(hole: readonly Card[]): number {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank) as [Card, Card];
  const pts = (r: number): number => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = pts(a.rank);
  if (a.rank === b.rank) s = Math.max(5, s * 2);
  else {
    if (a.suit === b.suit) s += 2;
    const gap = a.rank - b.rank - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a.rank < 12) s += 1;
  }
  return clamp01((Math.ceil(s) + 1) / 21);
}

/**
 * Monte Carlo equity against `opponents` random hands. Uses only what the bot can see:
 * its hole cards and the board. Unknown cards are drawn from the unseen part of the deck.
 */
export function estimateEquity(hole: readonly Card[], board: readonly Card[], opponents: number, samples: number, rnd: RandomInt): number {
  const known = new Set([...hole, ...board].map(cardKey));
  const rem = createDeck().filter((c) => !known.has(cardKey(c)));
  const needBoard = 5 - board.length;
  const need = needBoard + 2 * opponents;
  let score = 0;
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < need; i++) { const j = i + rnd(rem.length - i); [rem[i], rem[j]] = [rem[j]!, rem[i]!]; }
    const full = [...board, ...rem.slice(0, needBoard)];
    const mine = evaluateBest([...hole, ...full]).score;
    let best = -1, ties = 0;
    for (let o = 0; o < opponents; o++) {
      const h = evaluateBest([rem[needBoard + 2 * o]!, rem[needBoard + 2 * o + 1]!, ...full]).score;
      if (h > best) { best = h; ties = 1; } else if (h === best) ties++;
    }
    score += mine > best ? 1 : mine === best ? 1 / (ties + 1) : 0;
  }
  return score / samples;
}

/** Flush draw (4 to a flush using a hole card) and number of ranks that would complete a straight. */
export function detectDraws(hole: readonly Card[], board: readonly Card[]): { flush: boolean; straightOuts: number } {
  const all = [...hole, ...board];
  const suits = new Map<string, number>();
  for (const c of all) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  const flush = [...suits].some(([suit, n]) => n === 4 && hole.some((h) => h.suit === suit));
  const have = new Set<number>(all.map((c) => c.rank));
  if (have.has(14)) have.add(1);
  const has5 = (s: Set<number>): boolean => {
    for (let lo = 1; lo <= 10; lo++) if ([0, 1, 2, 3, 4].every((k) => s.has(lo + k))) return true;
    return false;
  };
  if (has5(have)) return { flush, straightOuts: 0 };
  let outs = 0;
  for (let r = 2; r <= 14; r++) {
    if (have.has(r)) continue;
    const t = new Set(have); t.add(r); if (r === 14) t.add(1);
    if (has5(t)) outs++;
  }
  return { flush, straightOuts: outs };
}

/** 0 = dry board, 1 = very wet (flush/straight heavy). */
export function boardWetness(board: readonly Card[]): number {
  if (board.length < 3) return 0;
  const suits = new Map<string, number>();
  for (const c of board) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  const maxSuit = Math.max(...suits.values());
  const ranks = [...new Set(board.map((c) => c.rank))].sort((x, y) => x - y);
  let connected = 0;
  for (let i = 1; i < ranks.length; i++) if (ranks[i]! - ranks[i - 1]! <= 2) connected++;
  return clamp01((maxSuit >= 3 ? 0.5 : maxSuit === 2 ? 0.15 : 0) + Math.min(4, connected) * 0.12);
}
