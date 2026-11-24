import { describe, expect, it } from 'vitest';
import { GLYPHS, textPath } from '../src/ui/pixel/font';
import { SUIT_BITMAPS, avatarColors, avatarGrid, chipBreakdown, gridPaths } from '../src/ui/pixel/data';
import { CENTER, betPosition, cardKey, planFlights, seatPosition, speedFactor, winningCardKeys } from '../src/ui/anim';
import { BOT_NAMES } from '../src/bots/personalities';
import { parseCards } from '../src/engine/deck';
import type { HandOutcome } from '../src/engine/game';
import type { HandResult } from '../src/engine/types';

describe('pixel font and sprites (generated in code)', () => {
  it('every glyph is 7 rows of 5-bit values, and the app text charset is covered', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, ch).toHaveLength(7);
      for (const r of rows) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(32); }
    }
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 +-/.:#()!?') expect(GLYPHS[ch], ch).toBeDefined();
    expect(textPath('A').length).toBeGreaterThan(0);
    expect(textPath('ab')).toBe(textPath('AB'));
    expect(textPath('~')).toBe(textPath('?'));   // unknown characters fall back to '?'
  });
  it('suit bitmaps are 9x9 and distinct', () => {
    const all = Object.values(SUIT_BITMAPS);
    for (const rows of all) { expect(rows).toHaveLength(9); rows.forEach((r) => expect(r).toHaveLength(9)); }
    expect(new Set(all.map((r) => r.join('|'))).size).toBe(4);
  });
  it('avatars: 8x8, deterministic, and unique for all bots and for the player', () => {
    const seen = new Set<string>();
    for (let i = -1; i < BOT_NAMES.length; i++) {
      const g = avatarGrid(i);
      expect(g).toHaveLength(8);
      g.forEach((r) => expect(r).toHaveLength(8));
      const used = new Set(Object.keys(gridPaths(g)));
      for (const ch of used) expect(avatarColors(i)[ch], `${i}:${ch}`).toBeDefined();
      expect(avatarGrid(i)).toEqual(g);
      seen.add(g.join('|') + JSON.stringify(avatarColors(i)));
    }
    expect(seen.size).toBe(BOT_NAMES.length + 1);
  });
  it('chip breakdown always sums to the amount, largest denominations first', () => {
    for (const a of [0, 1, 7, 25, 130, 999, 1000, 2765, 12345]) {
      const b = chipBreakdown(a);
      expect(b.reduce((s, x) => s + x.denom * x.count, 0)).toBe(a);
      for (let i = 1; i < b.length; i++) expect(b[i - 1]!.denom).toBeGreaterThan(b[i]!.denom);
    }
    expect(chipBreakdown(130)).toEqual([{ denom: 100, count: 1 }, { denom: 25, count: 1 }, { denom: 5, count: 1 }]);
  });
});

describe('layout and animation planning', () => {
  it('seat 0 is at the bottom, seats are distinct, bets sit between seat and pot', () => {
    for (const n of [4, 5, 6]) {
      expect(seatPosition(0, n).y).toBeGreaterThan(80);
      expect(new Set(Array.from({ length: n }, (_, k) => `${seatPosition(k, n).x.toFixed(1)},${seatPosition(k, n).y.toFixed(1)}`)).size).toBe(n);
      const s = seatPosition(0, n), b = betPosition(0, n);
      expect(b.y).toBeLessThan(s.y); expect(b.y).toBeGreaterThan(CENTER.y);
    }
  });
  it('speed factors: normal 1, fast faster, off 0', () => {
    expect(speedFactor.normal).toBe(1);
    expect(speedFactor.fast).toBeLessThan(1);
    expect(speedFactor.off).toBe(0);
  });
  it('no flights on the first state, a new hand or without a phase change', () => {
    const next = { hand: 1, phase: 'PREFLOP' as const, totals: [10, 20, 0] };
    expect(planFlights(null, next, null, 1).flights).toEqual([]);
    expect(planFlights({ hand: 0, phase: 'PAYOUT', gathered: [5, 5, 5] }, next, null, 1)).toEqual({ flights: [], gathered: [0, 0, 0] });
    expect(planFlights({ hand: 1, phase: 'PREFLOP', gathered: [0, 0, 0] }, next, null, 1).flights).toEqual([]);
  });
  it('bets gather to the pot when the street changes (only chips not yet gathered)', () => {
    const r = planFlights({ hand: 1, phase: 'PREFLOP', gathered: [0, 0, 0] }, { hand: 1, phase: 'FLOP', totals: [20, 20, 0] }, null, 1);
    expect(r.flights).toHaveLength(2);
    expect(r.flights.every((f) => f.to === CENTER)).toBe(true);
    expect(r.gathered).toEqual([20, 20, 0]);
    const r2 = planFlights({ hand: 1, phase: 'FLOP', gathered: r.gathered }, { hand: 1, phase: 'TURN', totals: [60, 20, 0] }, null, 1);
    expect(r2.flights.map((f) => f.amount)).toEqual([40]);
  });
  it('payout slides the pot from the center to every winner, after the gather', () => {
    const r = planFlights({ hand: 1, phase: 'RIVER', gathered: [20, 20, 0] }, { hand: 1, phase: 'PAYOUT', totals: [60, 60, 0] }, { 1: 120 }, 1);
    const win = r.flights.filter((f) => f.from === CENTER);
    expect(win).toHaveLength(1);
    expect(win[0]!.amount).toBe(120);
    expect(win[0]!.delayMs).toBeGreaterThan(0);
    expect(win[0]!.to).toEqual(seatPosition(1, 3));
  });
  it('animations off: no flights, but chips still count as gathered', () => {
    const r = planFlights({ hand: 1, phase: 'PREFLOP', gathered: [0, 0, 0] }, { hand: 1, phase: 'FLOP', totals: [20, 20, 0] }, null, 0);
    expect(r.flights).toEqual([]);
    expect(r.gathered).toEqual([20, 20, 0]);
  });
  it('winning cards: only the best five of pot winners, none without a showdown', () => {
    const hand = (s: string): HandResult => ({ score: 1, category: 0, isRoyal: false, best: parseCards(s) });
    const o: HandOutcome = { showdown: true, pots: [], payouts: { 1: 100 }, hands: { 1: hand('As Ks Qs Js Ts'), 2: hand('2c 3c 4c 5c 7d') } };
    expect(winningCardKeys(o)).toEqual(new Set(parseCards('As Ks Qs Js Ts').map(cardKey)));
    expect(winningCardKeys({ ...o, showdown: false }).size).toBe(0);
    expect(winningCardKeys(null).size).toBe(0);
  });
});
