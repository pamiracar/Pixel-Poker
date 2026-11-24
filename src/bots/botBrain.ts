import type { Action } from '../engine/game';
import type { RandomInt } from '../engine/deck';
import type { VisibleState } from '../engine/view';
import { evaluateBest } from '../engine/handEvaluator';
import { HandCategory } from '../engine/types';
import { boardWetness, detectDraws, estimateEquity, preflopStrength } from './equity';
import type { Personality } from './personalities';

/** Pure bot decision: visible state in, legal action out. */
export type BotDecider = (view: VisibleState, rnd: RandomInt) => Action;

/** Random but always legal. Kept for tests and as a baseline. */
export const randomBot: BotDecider = (view, rnd) => {
  const L = view.legal;
  if (!L) throw new Error('randomBot called when it is not this player\'s turn');
  const r = rnd(100);
  if (r < 10 && L.canFold) return { type: 'fold' };
  if (r < 28 && (L.canBet || L.canRaise)) {
    return { type: L.canBet ? 'bet' : 'raise', amount: L.minRaiseTo + rnd(Math.min(L.maxRaiseTo - L.minRaiseTo, 4 * view.bigBlind) + 1) };
  }
  if (r < 32 && L.canAllIn) return { type: 'allin' };
  return { type: L.canCheck ? 'check' : 'call' };
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Triangular noise in about +-0.1: the same spot never produces the same number twice. */
const noise = (rnd: RandomInt): number => ((rnd(1000) + rnd(1000) - 999) / 1000) * 0.1;
const chance = (rnd: RandomInt, p: number): boolean => rnd(10000) < clamp01(p) * 10000;

/** 0 = first to act after the button, 1 = on the button. */
function lateness(view: VisibleState): number {
  const n = view.players.length;
  const seats = view.players.filter((p) => p.inHand).sort((a, b) => ((a.id - view.dealer - 1 + n) % n) - ((b.id - view.dealer - 1 + n) % n));
  const idx = seats.findIndex((p) => p.id === view.me);
  return seats.length > 1 ? idx / (seats.length - 1) : 1;
}

/**
 * Builds a decision function for a personality. Inputs: hand strength (Chen preflop,
 * Monte Carlo equity postflop), pot odds, implied odds for draws, position, stack depth,
 * board texture and number of opponents. Output is sampled, never a fixed function of the spot.
 */
export function makeBot(p: Personality, opts: { samples?: number } = {}): BotDecider {
  const samples = opts.samples ?? 120;
  return (view, rnd) => {
    const L = view.legal;
    if (!L) throw new Error('Bot asked to act when it is not its turn');
    const me = view.players[view.me]!;
    const opps = view.players.filter((x) => x.inHand && !x.folded && x.id !== view.me);
    const n = opps.length + 1;
    const bb = view.bigBlind;
    const callAmt = L.callAmount;
    const potOdds = callAmt > 0 ? callAmt / (view.pot + callAmt) : 0;
    const late = lateness(view);
    const effBB = Math.min(me.stack + me.bet, Math.max(0, ...opps.map((o) => o.stack + o.bet))) / bb;
    const preflop = view.board.length === 0;

    const passive = (): Action => (L.canCheck ? { type: 'check' } : { type: 'call' });
    const fold = (): Action => (L.canCheck ? { type: 'check' } : L.canFold ? { type: 'fold' } : { type: 'call' });
    const raiseTo = (target: number): Action => {
      if (!(L.canBet || L.canRaise)) return passive();
      const to = Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(target)));
      if (to >= L.maxRaiseTo || me.stack + me.bet - to < bb) return L.canAllIn ? { type: 'allin' } : passive();
      return { type: L.canBet ? 'bet' : 'raise', amount: to };
    };

    const s = clamp01(
      (preflop ? preflopStrength(view.hole) : estimateEquity(view.hole, view.board, Math.min(opps.length, 3), samples, rnd)) + noise(rnd),
    );

    if (preflop) {
      const playT = lerp(0.5, 0.2, p.looseness) - 0.05 * late;
      const raiseT = lerp(0.62, 0.4, p.aggression);
      const facingRaise = view.currentBet > bb;
      if (effBB < 12) {                                   // short stack: push or fold
        if (s > lerp(0.45, 0.25, p.looseness)) return L.canAllIn ? { type: 'allin' } : passive();
        return callAmt === 0 ? passive() : s > potOdds + 0.1 ? passive() : fold();
      }
      if (s >= raiseT && chance(rnd, 0.5 + 0.5 * p.aggression)) {
        const limpers = view.actions.filter((a) => a.type === 'call' && a.phase === 'PREFLOP').length;
        return raiseTo(facingRaise ? view.currentBet * 3 : bb * (2.5 + rnd(150) / 100 + limpers));
      }
      if (s >= playT) {
        if (callAmt === 0) return passive();
        if (callAmt > 6 * bb && s < raiseT && !chance(rnd, p.callDownTendency * 0.6)) return fold();
        return passive();
      }
      if (!facingRaise && callAmt <= bb && late > 0.6 && chance(rnd, p.bluffFrequency * late * 0.8)) return raiseTo(bb * 3);
      if (callAmt === 0) return passive();
      if (callAmt <= bb && chance(rnd, p.callDownTendency * 0.15)) return passive();
      return fold();
    }

    // Postflop
    const draws = detectDraws(view.hole, view.board);
    const made = evaluateBest([...view.hole, ...view.board]).category;
    const isDraw = view.board.length < 5 && made <= HandCategory.Pair && (draws.flush || draws.straightOuts >= 1);
    const wet = boardWetness(view.board);
    const bluffAdj = (n === 2 ? 1.5 : 1 / (n - 1)) * (1.3 - 0.5 * wet); // fewer bluffs multiway / on wet boards
    const deep = effBB * bb > 4 * Math.max(callAmt, 1);

    if (callAmt > 0) {
      const eff = s + (isDraw && deep ? 0.07 * (draws.flush ? 1 : 0.6) : 0);  // implied odds
      const margin = lerp(0.12, -0.04, p.callDownTendency);
      const raiseSize = view.currentBet + (view.pot + callAmt) * 0.75;
      if (s >= lerp(0.85, 0.7, p.aggression) && L.canRaise && chance(rnd, p.aggression)) return raiseTo(raiseSize);
      if (isDraw && L.canRaise && chance(rnd, p.aggression * p.bluffFrequency * bluffAdj)) return raiseTo(raiseSize); // semi-bluff
      if (s < 0.3 && L.canRaise && chance(rnd, p.bluffFrequency * 0.2 * bluffAdj)) return raiseTo(raiseSize);          // pure bluff
      if (eff >= potOdds + margin) {
        if (s < 0.5 && chance(rnd, p.foldToPressure * potOdds)) return fold();
        return passive();
      }
      // Reluctance to fold: station-like bots keep calling with weak hands, rocks almost never do.
      if (s > 0.1 && chance(rnd, p.callDownTendency * p.callDownTendency * 0.5)) return passive();
      return fold();
    }
    // Checked to us
    if (!L.canBet) return passive();
    if (s >= lerp(0.68, 0.55, p.aggression) && chance(rnd, 0.45 + 0.5 * p.aggression)) return raiseTo(view.pot * (0.4 + 0.5 * s));
    if (isDraw && chance(rnd, p.aggression * 0.55)) return raiseTo(view.pot * 0.6);                                 // semi-bluff
    if (s < 0.45 && chance(rnd, p.bluffFrequency * bluffAdj * 0.5)) return raiseTo(view.pot * 0.55);                 // pure bluff
    return passive();
  };
}

/** Thinking time in ms: 0.6-2.0 s normally, up to +1 s more for big decisions (large bets, all-ins). */
export function thinkTimeMs(view: VisibleState, rnd: RandomInt): number {
  const base = 600 + rnd(1401);
  const L = view.legal;
  if (!L || L.callAmount === 0) return base;
  const stack = view.players[view.me]?.stack ?? 0;
  const hardness = L.callAmount >= stack ? 1 : Math.min(1, L.callAmount / Math.max(1, view.pot));
  return base + Math.round(hardness * rnd(1001));
}
