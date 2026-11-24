import { HandCategory, type Card, type HandResult } from './types';

const BASE = 15;

/** Evaluates exactly 5 cards. Score = category * 15^5 + tiebreak ranks in base 15. */
function evaluate5(cards: Card[]): { score: number; category: HandCategory } {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);

  // Groups ordered by (count desc, rank desc): the natural tiebreak order.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.map(([rank]) => rank);
  const shape = groups.map(([, n]) => n).join('');

  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const uniq = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
    else if (uniq.join() === '14,5,4,3,2') straightHigh = 5; // wheel: ace plays low
  }

  let category: HandCategory;
  let tiebreak = ordered;
  if (straightHigh && flush) { category = HandCategory.StraightFlush; tiebreak = [straightHigh]; }
  else if (shape === '41') category = HandCategory.FourOfAKind;
  else if (shape === '32') category = HandCategory.FullHouse;
  else if (flush) category = HandCategory.Flush;
  else if (straightHigh) { category = HandCategory.Straight; tiebreak = [straightHigh]; }
  else if (shape === '311') category = HandCategory.ThreeOfAKind;
  else if (shape === '221') category = HandCategory.TwoPair;
  else if (shape === '2111') category = HandCategory.Pair;
  else category = HandCategory.HighCard;

  let score: number = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (tiebreak[i] ?? 0);
  return { score, category };
}

/** Best 5-card hand out of 5 to 7 cards (2 hole + up to 5 board). */
export function evaluateBest(cards: readonly Card[]): HandResult {
  if (cards.length < 5 || cards.length > 7) throw new Error(`Need 5-7 cards, got ${cards.length}`);
  const n = cards.length;
  let bestScore = -1;
  let bestCategory = HandCategory.HighCard as HandCategory;
  let bestCards: Card[] = [];
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === 5) {
      const hand = chosen.map((i) => cards[i] as Card);
      const r = evaluate5(hand);
      if (r.score > bestScore) { bestScore = r.score; bestCategory = r.category; bestCards = hand; }
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  const isRoyal = bestCategory === HandCategory.StraightFlush
    && bestCards.some((c) => c.rank === 14) && bestCards.some((c) => c.rank === 13);
  return { score: bestScore, category: bestCategory, isRoyal, best: bestCards };
}

export function categoryName(r: HandResult): string {
  if (r.isRoyal) return 'Royal Flush';
  return ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'][r.category]!;
}
