import type { Card } from '../engine/types';
import type { ActionRecord, HandOutcome, Phase } from '../engine/game';

export type AnimSpeed = 'normal' | 'fast' | 'off';
/** Multiplier applied to every animation duration/delay (CSS uses the same values via --k). */
export const speedFactor: Record<AnimSpeed, number> = { normal: 1, fast: 0.4, off: 0 };

export interface Pt { x: number; y: number }
export const CENTER: Pt = { x: 50, y: 50 };
/** Design size of the felt in stage pixels (the whole stage is scaled to fit the screen). */
export const FELT_W = 1200, FELT_H = 520;
export const FELT_ASPECT = FELT_W / FELT_H;

/** Seat position in % of the felt. Seat 0 (you) is at the bottom, others follow clockwise. */
export function seatPosition(k: number, n: number): Pt {
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
  return { x: 50 + 41.5 * Math.cos(a), y: 50 + 34.5 * Math.sin(a) };
}
/** Where a seat's current bet is drawn: between the seat and the pot. */
export function betPosition(k: number, n: number): Pt {
  const s = seatPosition(k, n);
  return { x: CENTER.x + (s.x - CENTER.x) * 0.6, y: CENTER.y + (s.y - CENTER.y) * 0.46 };
}

export interface Flight { id: number; amount: number; from: Pt; to: Pt; delayMs: number }
export interface FlightState { hand: number; phase: Phase; gathered: number[] }

/**
 * Decides which chip flights to show after a state change:
 * bets gather into the pot when the street changes, and the pot slides to winners at payout.
 * Pure: `prev.gathered` remembers how many chips of each seat were already moved to the pot.
 */
export function planFlights(
  prev: FlightState | null,
  next: { hand: number; phase: Phase; totals: number[] },
  payouts: Record<number, number> | null,
  factor: number,
): { flights: Omit<Flight, 'id'>[]; gathered: number[] } {
  const n = next.totals.length;
  if (!prev || prev.hand !== next.hand) return { flights: [], gathered: Array<number>(n).fill(0) };
  if (prev.phase === next.phase) return { flights: [], gathered: prev.gathered };
  const flights: Omit<Flight, 'id'>[] = [];
  const gathered = next.totals.slice();
  if (factor > 0) {
    next.totals.forEach((t, id) => {
      const amount = t - (prev.gathered[id] ?? 0);
      if (amount > 0) flights.push({ amount, from: betPosition(id, n), to: CENTER, delayMs: 0 });
    });
    if (next.phase === 'PAYOUT' && payouts) {
      for (const [id, amount] of Object.entries(payouts)) {
        flights.push({ amount, from: CENTER, to: seatPosition(Number(id), n), delayMs: Math.round(450 * factor) });
      }
    }
  }
  return { flights, gathered };
}

export const cardKey = (c: Card): string => `${c.rank}${c.suit}`;

/** Cards that make up the best five-card hand of every pot winner (empty without a showdown). */
export function winningCardKeys(o: HandOutcome | null): Set<string> {
  const keys = new Set<string>();
  if (!o || !o.showdown) return keys;
  for (const id of Object.keys(o.payouts)) for (const c of o.hands[Number(id)]?.best ?? []) keys.add(cardKey(c));
  return keys;
}

/** Chips thrown from a seat to its bet spot whenever that seat's bet grows within the same hand. */
export function planBetFlights(prev: { hand: number; bets: number[] } | null, next: { hand: number; bets: number[] }, factor: number): Omit<Flight, 'id'>[] {
  if (!prev || prev.hand !== next.hand || factor === 0) return [];
  const n = next.bets.length;
  return next.bets.flatMap((b, id) => {
    const before = prev.bets[id] ?? 0;
    return b > before ? [{ amount: b - before, from: seatPosition(id, n), to: betPosition(id, n), delayMs: 0 }] : [];
  });
}

/** Short text for each seat's latest action on the current street (cleared when the street changes). */
export function lastActionLabels(log: ActionRecord[], phase: Phase): Record<number, string> {
  const street = phase === 'PAYOUT' || phase === 'SHOWDOWN' ? log[log.length - 1]?.phase : phase;
  const out: Record<number, string> = {};
  for (const a of log) {
    if (a.phase !== street) continue;
    out[a.playerId] = a.type === 'fold' ? 'FOLD' : a.type === 'check' ? 'CHECK' : a.type === 'call' ? `CALL ${a.amount}`
      : a.type === 'bet' ? `BET ${a.amount}` : a.type === 'raise' ? `RAISE ${a.amount}` : `ALL-IN ${a.amount}`;
  }
  return out;
}
