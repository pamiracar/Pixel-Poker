import { describe, expect, it } from 'vitest';
import { PokerGame, type GameConfig } from '../src/engine/game';
import { cardToString, createDeck, parseCards, seededRandomInt } from '../src/engine/deck';

function rig(holes: string[], board: string) {
  const cards = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(cards.map(cardToString));
  return () => [...cards, ...createDeck().filter((x) => !used.has(cardToString(x)))];
}
const mk = (stacks: number[], holes?: string[], board = '2c 7d 9h Js 3c', extra: Partial<GameConfig> = {}) => {
  const g = new PokerGame({ stacks, smallBlind: 10, bigBlind: 20, ...(holes ? { deckProvider: rig(holes, board) } : {}), ...extra });
  g.startHand();
  return g;
};
const total = (g: PokerGame) => g.players.reduce((s, p) => s + p.stack, 0);
const checkdown = (g: PokerGame) => {
  while (g.isBetting) { const L = g.legalActions()!; g.act(L.playerId, { type: L.canCheck ? 'check' : 'call' }); }
};

describe('blinds, positions, state machine', () => {
  it('3-handed: SB/BB posted, UTG (dealer) acts first', () => {
    const g = mk([1000, 1000, 1000]);
    expect([g.players[1]!.bet, g.players[2]!.bet]).toEqual([10, 20]);
    expect(g.toAct).toBe(0);
    expect(g.phase).toBe('PREFLOP');
  });
  it('heads-up: dealer is SB and acts first preflop, BB acts first postflop', () => {
    const g = mk([1000, 1000]);
    expect(g.players[0]!.bet).toBe(10);
    expect(g.players[1]!.bet).toBe(20);
    expect(g.toAct).toBe(0);
    g.act(0, { type: 'call' }); g.act(1, { type: 'check' });
    expect(g.phase).toBe('FLOP');
    expect(g.toAct).toBe(1);
  });
  it('dealer button advances each hand', () => {
    const g = mk([1000, 1000, 1000]);
    g.act(0, { type: 'fold' }); g.act(1, { type: 'fold' });
    g.startHand();
    expect(g.dealer).toBe(1);
  });
  it('rejects starting a hand mid-hand and acting out of turn / illegally', () => {
    const g = mk([1000, 1000, 1000]);
    expect(() => g.startHand()).toThrow();
    expect(() => g.act(1, { type: 'call' })).toThrow(/turn/);
    expect(() => g.act(0, { type: 'check' })).toThrow();
    expect(() => g.act(0, { type: 'bet', amount: 100 })).toThrow();
  });
  it('rebuy is rejected mid-hand', () => expect(() => mk([1000, 1000]).rebuy(0, 1000)).toThrow());
});

describe('minimum raise', () => {
  it('enforces min raise and re-raise sizes', () => {
    const g = mk([1000, 1000, 1000]);
    expect(g.legalActions()!.minRaiseTo).toBe(40);
    expect(() => g.act(0, { type: 'raise', amount: 39 })).toThrow(/minimum/);
    g.act(0, { type: 'raise', amount: 60 });                 // raise size 40
    expect(g.legalActions()!.minRaiseTo).toBe(100);
    expect(() => g.act(1, { type: 'raise', amount: 99 })).toThrow();
    g.act(1, { type: 'raise', amount: 100 });                // size 40 again
    expect(g.legalActions()!.minRaiseTo).toBe(140);
  });
  it('min bet on a new street is the big blind; cannot bet when a bet exists', () => {
    const g = mk([1000, 1000]);
    g.act(0, { type: 'call' }); g.act(1, { type: 'check' });
    const L = g.legalActions()!;
    expect([L.canBet, L.canRaise, L.minRaiseTo]).toEqual([true, false, 20]);
    expect(() => g.act(1, { type: 'bet', amount: 19 })).toThrow();
    g.act(1, { type: 'bet', amount: 20 });
    expect(() => g.act(0, { type: 'bet', amount: 40 })).toThrow();
  });
  it('an all-in below the minimum raise is allowed', () => {
    const g = mk([1000, 1000, 45]);
    g.act(0, { type: 'raise', amount: 60 });
    g.act(1, { type: 'call' });
    g.act(2, { type: 'allin' });
    expect(g.players[2]!.allIn).toBe(true);
    expect(g.players[2]!.totalBet).toBe(45);  // call-for-less, hand moves on
    expect(g.phase).toBe('FLOP');
  });
  it('a short all-in raise does not reopen raising for players who already acted', () => {
    const g = mk([1000, 1000, 75]);
    g.act(0, { type: 'raise', amount: 60 });
    g.act(1, { type: 'call' });
    g.act(2, { type: 'allin' });                              // to 75: raise of 15 < 40
    const L = g.legalActions()!;
    expect(g.toAct).toBe(0);
    expect([L.canRaise, L.callAmount]).toEqual([false, 15]);
    g.act(0, { type: 'call' });
    expect(g.legalActions()!.canRaise).toBe(false);
    g.act(1, { type: 'call' });
    expect(g.phase).toBe('FLOP');
  });
  it('a full raise reopens the action', () => {
    const g = mk([1000, 1000, 1000]);
    g.act(0, { type: 'raise', amount: 60 }); g.act(1, { type: 'call' });
    g.act(2, { type: 'raise', amount: 100 });
    expect(g.legalActions()!.canRaise).toBe(true);
  });
});

describe('hand endings', () => {
  it('everyone folds: sole survivor takes the pot without a showdown', () => {
    const g = mk([1000, 1000, 1000]);
    g.act(0, { type: 'fold' }); g.act(1, { type: 'fold' });
    expect(g.phase).toBe('PAYOUT');
    expect(g.outcome!.showdown).toBe(false);
    expect(g.outcome!.hands).toEqual({});
    expect(g.players.map((p) => p.stack)).toEqual([1000, 990, 1010]);
  });
  it('full-board showdown, best hand wins', () => {
    const g = mk([1000, 1000], ['As Ad', 'Kh Kd'], '2c 7d 9h Js 3c');
    g.act(0, { type: 'call' }); g.act(1, { type: 'check' });
    checkdown(g);
    expect(g.outcome!.showdown).toBe(true);
    expect(g.players.map((p) => p.stack)).toEqual([1020, 980]);
  });
  it('side pots: three all-ins of different sizes pay out correctly, runout is automatic', () => {
    const g = mk([100, 300, 1000], ['As Ah', 'Ks Kh', 'Qs Qh']);
    g.act(0, { type: 'allin' }); g.act(1, { type: 'allin' }); g.act(2, { type: 'call' });
    expect(g.phase).toBe('PAYOUT');
    expect(g.board).toHaveLength(5);
    expect(g.players.map((p) => p.stack)).toEqual([300, 400, 700]);
    expect(g.outcome!.pots).toHaveLength(2);
  });
  it('uncalled bet is returned to the bettor', () => {
    const g = mk([1000, 50, 1000], ['Kh Kd', 'As Ah', 'Qs Qd']);
    g.act(0, { type: 'raise', amount: 200 }); g.act(1, { type: 'call' }); g.act(2, { type: 'fold' });
    expect(g.phase).toBe('PAYOUT');
    expect(g.players.map((p) => p.stack)).toEqual([950, 120, 980]);
  });
  it('three-way chop returns each player their own chips', () => {
    const g = mk([1000, 1000, 1000], ['Ah 2d', 'Ac 3d', 'Kd 4c'], 'As Ks Qs Js Ts');
    checkdown(g);
    expect(g.outcome!.pots[0]!.winners).toEqual([1, 2, 0].sort((a, b) => [1, 2, 0].indexOf(a) - [1, 2, 0].indexOf(b)));
    expect(g.players.map((p) => p.stack)).toEqual([1000, 1000, 1000]);
  });
  it('short stack posts a partial blind and is automatically all-in', () => {
    const g = mk([1000, 5, 1000]);
    expect(g.players[1]!.bet).toBe(5);
    expect(g.players[1]!.allIn).toBe(true);
    expect(g.currentBet).toBe(20);
    expect(g.toAct).toBe(0);
  });
  it('short big blind: currentBet is the highest posted blind', () => {
    const g = mk([1000, 1000, 8]);
    expect([g.players[2]!.bet, g.currentBet]).toEqual([8, 10]);
  });
  it('blinds covering everyone runs the board out immediately', () => {
    const g = mk([1000, 5, 15], ['As Ah', 'Ks Kh', 'Qs Qh']);
    g.act(0, { type: 'fold' });
    expect(g.phase).toBe('PAYOUT');
    expect(g.board).toHaveLength(5);
    expect(total(g)).toBe(1020);
  });
});

describe('invariants', () => {
  it('fuzz: chips are conserved and hands always terminate (rebuys tracked)', () => {
    const rnd = seededRandomInt(7);
    const g = new PokerGame({ stacks: [1000, 1000, 1000, 1000, 1000], smallBlind: 10, bigBlind: 20, rng: seededRandomInt(99) });
    let rebuys = 0;
    for (let h = 0; h < 400; h++) {
      for (const p of g.players) if (p.stack === 0) { g.rebuy(p.id, 1000); rebuys++; }
      g.startHand();
      for (let steps = 0; g.isBetting; steps++) {
        expect(steps).toBeLessThan(200);
        expect(total(g) + g.pot).toBe(5000 + rebuys * 1000);
        const L = g.legalActions()!;
        const r = rnd(100);
        if (r < 12 && L.canFold) g.act(L.playerId, { type: 'fold' });
        else if (r < 30 && (L.canBet || L.canRaise)) {
          g.act(L.playerId, { type: L.canBet ? 'bet' : 'raise', amount: L.minRaiseTo + rnd(L.maxRaiseTo - L.minRaiseTo + 1) });
        } else if (r < 35 && L.canAllIn) g.act(L.playerId, { type: 'allin' });
        else g.act(L.playerId, { type: L.canCheck ? 'check' : 'call' });
      }
      expect(g.phase).toBe('PAYOUT');
      expect(total(g)).toBe(5000 + rebuys * 1000);
    }
  });
});

describe('blind seats', () => {
  it('exposes SB/BB seats for the UI (heads-up and multiway)', () => {
    const g3 = mk([1000, 1000, 1000]);
    expect([g3.sbSeat, g3.bbSeat]).toEqual([1, 2]);
    const g2 = mk([1000, 1000]);
    expect([g2.sbSeat, g2.bbSeat]).toEqual([0, 1]);
  });
});
