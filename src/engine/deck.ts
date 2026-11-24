import type { Card, Rank, Suit } from './types';

/** Returns an integer in [0, n). Injectable so tests can be deterministic. */
export type RandomInt = (n: number) => number;

const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (let r = 2; r <= 14; r++) deck.push({ rank: r as Rank, suit });
  return deck;
}

/** Unbiased crypto-based integer using rejection sampling. */
export const cryptoRandomInt: RandomInt = (n) => {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x: number;
  do { crypto.getRandomValues(buf); x = buf[0] as number; } while (x >= limit);
  return x % n;
};

/** Seeded RNG (mulberry32) for tests. */
export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle(deck: readonly Card[], rnd: RandomInt = cryptoRandomInt): Card[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j] as Card, a[i] as Card];
  }
  return a;
}

export function cardToString(c: Card): string {
  const r = ({ 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[c.rank] ?? String(c.rank);
  return r + c.suit;
}

/** Parse "As Kd 9c" style strings (T = ten). Used by tests and tools. */
export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).map((t) => {
    const r = t.slice(0, -1).toUpperCase();
    const rank = ({ T: 10, J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r] ?? Number(r);
    return { rank: rank as Rank, suit: t.slice(-1).toLowerCase() as Suit };
  });
}
