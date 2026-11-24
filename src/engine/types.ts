export type Suit = 's' | 'h' | 'd' | 'c';
/** 2..10, 11=J, 12=Q, 13=K, 14=A */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card { rank: Rank; suit: Suit }

export enum HandCategory {
  HighCard, Pair, TwoPair, ThreeOfAKind, Straight, Flush, FullHouse, FourOfAKind, StraightFlush,
}
export interface HandResult {
  /** Numeric score: higher always wins, equal means split pot. */
  score: number;
  category: HandCategory;
  isRoyal: boolean;
  /** The 5 cards that make the best hand (for winner highlighting). */
  best: Card[];
}
