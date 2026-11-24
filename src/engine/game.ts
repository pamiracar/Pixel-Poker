import type { Card, HandResult } from './types';
import { createDeck, cryptoRandomInt, shuffle, type RandomInt } from './deck';
import { evaluateBest } from './handEvaluator';
import { buildPots, distributePots, type PotResult } from './pots';

export type Phase = 'WAITING' | 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'PAYOUT';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
/** `amount` is the total bet level for bet/raise ("raise to"), not the increment. */
export interface Action { type: ActionType; amount?: number }

export interface Player {
  id: number; name: string; stack: number;
  bet: number; totalBet: number;
  folded: boolean; allIn: boolean; inHand: boolean;
  hole: Card[]; acted: boolean; seen: number; rebuys: number;
}
/** Public action history of the current hand (amount = player's bet level after the action). */
export interface ActionRecord { playerId: number; phase: Phase; type: ActionType; amount: number }
export interface LegalActions {
  playerId: number; canFold: boolean; canCheck: boolean; canCall: boolean; callAmount: number;
  canBet: boolean; canRaise: boolean; canAllIn: boolean; minRaiseTo: number; maxRaiseTo: number;
}
export interface HandOutcome {
  showdown: boolean; pots: PotResult[];
  payouts: Record<number, number>; hands: Record<number, HandResult>;
}
export interface GameConfig {
  stacks: number[]; names?: string[]; smallBlind: number; bigBlind: number;
  dealer?: number; rng?: RandomInt;
  /** Test hook: returns an ordered deck, dealt from the front. */
  deckProvider?: () => Card[];
}

const NEXT: Record<Phase, Phase[]> = {
  WAITING: ['PREFLOP'],
  PREFLOP: ['FLOP', 'SHOWDOWN', 'PAYOUT'],
  FLOP: ['TURN', 'SHOWDOWN', 'PAYOUT'],
  TURN: ['RIVER', 'SHOWDOWN', 'PAYOUT'],
  RIVER: ['SHOWDOWN', 'PAYOUT'],
  SHOWDOWN: ['PAYOUT'],
  PAYOUT: ['WAITING', 'PREFLOP'],
};

export class PokerGame {
  phase: Phase = 'WAITING';
  players: Player[];
  board: Card[] = [];
  dealer: number;
  toAct = -1;
  sbSeat = -1;
  bbSeat = -1;
  currentBet = 0;
  minRaise: number;
  outcome: HandOutcome | null = null;
  actionLog: ActionRecord[] = [];
  /** Stacks at the start of the hand, before blinds (for history and replay). */
  startStacks: number[] = [];
  handsPlayed = 0;
  readonly smallBlind: number;
  readonly bigBlind: number;
  private raiseCount = 0;
  private deck: Card[] = [];
  private deckPos = 0;
  private readonly deckProvider: () => Card[];

  constructor(cfg: GameConfig) {
    if (cfg.stacks.length < 2 || cfg.stacks.length > 6) throw new Error('Table needs 2-6 players');
    if (![cfg.smallBlind, cfg.bigBlind, ...cfg.stacks].every(Number.isInteger)) throw new Error('Blinds and stacks must be whole numbers');
    if (cfg.smallBlind <= 0 || cfg.bigBlind < cfg.smallBlind) throw new Error('Blinds must be positive with big blind >= small blind');
    if (cfg.stacks.some((x) => x < 0)) throw new Error('Stacks cannot be negative');
    this.smallBlind = cfg.smallBlind;
    this.bigBlind = cfg.bigBlind;
    this.minRaise = cfg.bigBlind;
    this.dealer = cfg.dealer ?? 0;
    const rng = cfg.rng ?? cryptoRandomInt;
    this.deckProvider = cfg.deckProvider ?? (() => shuffle(createDeck(), rng));
    this.players = cfg.stacks.map((stack, id) => ({
      id, name: cfg.names?.[id] ?? `P${id}`, stack, bet: 0, totalBet: 0, folded: false, allIn: false,
      inHand: false, hole: [], acted: false, seen: 0, rebuys: 0,
    }));
  }

  get pot(): number { return this.players.reduce((s, p) => s + p.totalBet, 0); }
  get isBetting(): boolean { return this.phase === 'PREFLOP' || this.phase === 'FLOP' || this.phase === 'TURN' || this.phase === 'RIVER'; }

  private P(id: number): Player {
    const p = this.players[id];
    if (!p) throw new Error(`No such player ${id}`);
    return p;
  }
  private setPhase(next: Phase): void {
    if (!NEXT[this.phase].includes(next)) throw new Error(`Invalid transition ${this.phase} -> ${next}`);
    this.phase = next;
  }
  private seatAfter(from: number, pred: (p: Player) => boolean): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) { const idx = (from + i) % n; if (pred(this.P(idx))) return idx; }
    return -1;
  }
  private draw(): Card {
    const c = this.deck[this.deckPos++];
    if (!c) throw new Error('Deck exhausted');
    return c;
  }
  private pay(p: Player, x: number): void {
    p.stack -= x; p.bet += x; p.totalBet += x;
    if (p.stack === 0) p.allIn = true;
  }
  private isLive = (p: Player): boolean => p.inHand && !p.folded && !p.allIn;

  /** Add chips between hands (cash game rebuy). */
  rebuy(id: number, amount: number): void {
    if (this.phase !== 'WAITING' && this.phase !== 'PAYOUT') throw new Error('Rebuy only between hands');
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid rebuy amount');
    const p = this.P(id);
    p.stack += amount; p.rebuys++;
  }

  startHand(): void {
    if (this.phase !== 'WAITING' && this.phase !== 'PAYOUT') throw new Error(`Cannot start a hand during ${this.phase}`);
    if (this.players.filter((p) => p.stack > 0).length < 2) throw new Error('Need at least two players with chips');
    if (this.handsPlayed > 0 || this.P(this.dealer).stack === 0) this.dealer = this.seatAfter(this.dealer, (p) => p.stack > 0);
    this.setPhase('PREFLOP');
    this.startStacks = this.players.map((p) => p.stack);
    this.handsPlayed++;
    this.outcome = null; this.actionLog = []; this.board = []; this.deck = this.deckProvider(); this.deckPos = 0;
    this.raiseCount = 0; this.minRaise = this.bigBlind;
    for (const p of this.players) {
      Object.assign(p, { bet: 0, totalBet: 0, folded: false, allIn: false, acted: false, seen: 0, hole: [], inHand: p.stack > 0 });
    }
    for (const p of this.players) if (p.inHand) p.hole = [this.draw(), this.draw()];
    const inHand = (p: Player): boolean => p.inHand;
    const headsUp = this.players.filter(inHand).length === 2;
    // Heads-up: dealer posts the small blind and acts first preflop.
    const sb = headsUp ? this.dealer : this.seatAfter(this.dealer, inHand);
    const bb = this.seatAfter(sb, inHand);
    this.sbSeat = sb; this.bbSeat = bb;
    const sbP = this.P(sb), bbP = this.P(bb);
    this.pay(sbP, Math.min(sbP.stack, this.smallBlind));      // short stack = partial blind, auto all-in
    this.pay(bbP, Math.min(bbP.stack, this.bigBlind));
    this.currentBet = Math.max(sbP.bet, bbP.bet);
    this.toAct = this.seatAfter(bb, this.isLive);
    this.progress();
  }

  legalActions(): LegalActions | null {
    if (!this.isBetting || this.toAct < 0) return null;
    const p = this.P(this.toAct);
    const toCall = this.currentBet - p.bet;
    const max = p.bet + p.stack;
    const canReopen = !p.acted || p.seen < this.raiseCount; // short all-ins do not reopen raising
    return {
      playerId: p.id, canFold: toCall > 0, canCheck: toCall === 0, canCall: toCall > 0,
      callAmount: Math.min(toCall, p.stack),
      canBet: this.currentBet === 0 && p.stack > 0,
      canRaise: this.currentBet > 0 && p.stack > toCall && canReopen,
      canAllIn: p.stack > 0,
      minRaiseTo: Math.min(max, this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise),
      maxRaiseTo: max,
    };
  }

  act(playerId: number, a: Action): void {
    const L = this.legalActions();
    if (!L) throw new Error(`No action allowed in phase ${this.phase}`);
    if (playerId !== this.toAct) throw new Error(`Not player ${playerId}'s turn`);
    const p = this.P(playerId);
    const fail = (m: string): never => { throw new Error(`Illegal ${a.type}: ${m}`); };
    switch (a.type) {
      case 'fold': if (!L.canFold) fail('nothing to call'); p.folded = true; break;
      case 'check': if (!L.canCheck) fail('facing a bet'); break;
      case 'call': if (!L.canCall) fail('nothing to call'); this.pay(p, L.callAmount); break;
      case 'bet': case 'raise': {
        const to = a.amount;
        if (to === undefined || !Number.isInteger(to)) fail('amount required');
        if (a.type === 'bet' ? !L.canBet : !L.canRaise) fail('not allowed now');
        if (to! > L.maxRaiseTo) fail('exceeds stack');
        if (to! < L.minRaiseTo && to !== L.maxRaiseTo) fail(`below minimum ${L.minRaiseTo}`);
        this.raiseTo(p, to!);
        break;
      }
      case 'allin': {
        if (!L.canAllIn) fail('no chips');
        const to = p.bet + p.stack;
        if (to <= this.currentBet) this.pay(p, p.stack); else this.raiseTo(p, to);
        break;
      }
    }
    this.actionLog.push({ playerId, phase: this.phase, type: a.type, amount: p.bet });
    p.acted = true; p.seen = this.raiseCount;
    this.toAct = this.seatAfter(playerId, this.isLive);
    this.progress();
  }

  private raiseTo(p: Player, to: number): void {
    const size = to - this.currentBet;
    this.pay(p, to - p.bet);
    if (size >= this.minRaise) { this.minRaise = size; this.raiseCount++; } // only full raises reopen
    this.currentBet = to;
  }

  private roundComplete(): boolean {
    const live = this.players.filter(this.isLive);
    if (live.length <= 1) return live.every((p) => p.bet >= this.currentBet);
    return live.every((p) => p.acted && p.bet === this.currentBet);
  }

  /** Advances streets / ends the hand until a player has to act again. */
  private progress(): void {
    for (;;) {
      const alive = this.players.filter((p) => p.inHand && !p.folded);
      if (alive.length === 1) return this.settle(false);
      if (!this.roundComplete()) return;
      if (this.phase === 'RIVER') return this.settle(true);
      this.nextStreet();
    }
  }

  private nextStreet(): void {
    const next: Phase = this.phase === 'PREFLOP' ? 'FLOP' : this.phase === 'FLOP' ? 'TURN' : 'RIVER';
    this.setPhase(next);
    for (let i = next === 'FLOP' ? 3 : 1; i > 0; i--) this.board.push(this.draw());
    for (const p of this.players) { p.bet = 0; p.acted = false; p.seen = 0; }
    this.currentBet = 0; this.minRaise = this.bigBlind; this.raiseCount = 0;
    this.toAct = this.seatAfter(this.dealer, this.isLive);
  }

  private settle(showdown: boolean): void {
    // Refund any uncalled portion of the largest contribution.
    const sorted = this.players.filter((p) => p.inHand).sort((a, b) => b.totalBet - a.totalBet);
    const top = sorted[0]!, second = sorted[1]!;
    if (top.totalBet > second.totalBet) {
      const diff = top.totalBet - second.totalBet;
      top.stack += diff; top.totalBet -= diff;
    }
    if (showdown) this.setPhase('SHOWDOWN');
    const scores = new Map<number, number>();
    const hands: Record<number, HandResult> = {};
    for (const p of this.players) {
      if (!p.inHand || p.folded) continue;
      if (showdown) { const h = evaluateBest([...p.hole, ...this.board]); hands[p.id] = h; scores.set(p.id, h.score); }
      else scores.set(p.id, 0); // sole survivor: no cards are shown
    }
    const pots = buildPots(this.players.filter((p) => p.inHand).map((p) => ({ id: p.id, amount: p.totalBet, folded: p.folded })));
    const order: number[] = [];
    for (let i = 1; i <= this.players.length; i++) order.push((this.dealer + i) % this.players.length);
    const { payouts, results } = distributePots(pots, scores, order);
    const out: Record<number, number> = {};
    for (const [id, amt] of payouts) { this.P(id).stack += amt; out[id] = amt; }
    this.outcome = { showdown, pots: results, payouts: out, hands };
    this.toAct = -1;
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.setPhase('PAYOUT');
  }
}
