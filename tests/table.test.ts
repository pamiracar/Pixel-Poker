import { describe, expect, it } from 'vitest';
import { Table } from '../src/engine/table';
import { seededRandomInt } from '../src/engine/deck';
import { randomBot, type BotDecider } from '../src/bots/botBrain';
import { visibleState, type VisibleState } from '../src/engine/view';

const cfg = { startingStack: 1000, smallBlind: 10, bigBlind: 20, botSamples: 8 };

describe('bot-only sessions', () => {
  it('plays 300 full hands: chips are conserved and rebuys are tracked per seat', () => {
    const t = new Table({ ...cfg, botCount: 4, humanAsBot: true, rng: seededRandomInt(5) });
    for (let h = 0; h < 300; h++) {
      t.nextHand();
      expect(t.game.phase).toBe('PAYOUT');
      const stacks = t.game.players.reduce((s, p) => s + p.stack, 0);
      expect(stacks).toBe(t.buyIns.reduce((s, b) => s + b, 0));
    }
    for (const p of t.game.players) expect(t.buyIns[p.id]).toBe(1000 * (1 + p.rebuys));
    expect(t.game.players.reduce((s, p) => s + p.rebuys, 0)).toBeGreaterThan(0);
  });
  it('works for every legal bot count', () => {
    for (const botCount of [3, 4, 5]) {
      const t = new Table({ ...cfg, botCount, humanAsBot: true, rng: seededRandomInt(botCount) });
      for (let h = 0; h < 30; h++) t.nextHand();
      expect(t.game.players).toHaveLength(botCount + 1);
    }
  });
  it('rejects bot counts outside 3-5', () => {
    expect(() => new Table({ ...cfg, botCount: 2 })).toThrow();
    expect(() => new Table({ ...cfg, botCount: 6 })).toThrow();
  });
});

describe('bots cannot cheat', () => {
  it('every decision sees only own hole cards, no deck, no opponent cards', () => {
    let calls = 0;
    const spy: BotDecider = (view: VisibleState, rnd) => {
      calls++;
      const json = JSON.stringify(view);
      expect(json.match(/"hole":/g)).toHaveLength(1);                 // only the viewer's own cards
      expect(view.players.every((p) => !('hole' in p))).toBe(true);
      expect('deck' in view).toBe(false);
      expect(view.shownHands).toEqual({});                             // nothing is revealed mid-hand
      expect(view.legal?.playerId).toBe(view.me);
      return randomBot(view, rnd);
    };
    const t = new Table({ ...cfg, botCount: 4, humanAsBot: true, rng: seededRandomInt(11), deciderFor: () => spy });
    for (let h = 0; h < 40; h++) t.nextHand();
    expect(calls).toBeGreaterThan(100);
  });
  it('mutating a view cannot change the game', () => {
    const evil: BotDecider = (view, rnd) => {
      view.hole.length = 0; view.board.push({ rank: 2, suit: 's' });
      view.players.forEach((p) => { p.stack = 999999; });
      return randomBot(view, rnd);
    };
    const t = new Table({ ...cfg, botCount: 3, humanAsBot: true, rng: seededRandomInt(3), deciderFor: () => evil });
    for (let h = 0; h < 20; h++) {
      t.nextHand();
      expect(t.game.board.length).toBeLessThanOrEqual(5);
      expect(t.game.players.reduce((s, p) => s + p.stack, 0)).toBe(t.buyIns.reduce((s, b) => s + b, 0));
    }
  });
  it('showdown cards appear in the view only after the showdown', () => {
    const t = new Table({ ...cfg, botCount: 3, humanAsBot: true, rng: seededRandomInt(21) });
    let seen = false;
    for (let h = 0; h < 60 && !seen; h++) {
      t.nextHand();
      if (t.game.outcome?.showdown) {
        seen = true;
        const shown = Object.keys(t.game.outcome.hands);
        const folded = t.game.players.filter((p) => p.folded).map((p) => String(p.id));
        const v = visibleState(t.game, 0);
        expect(Object.keys(v.shownHands).sort()).toEqual(shown.sort());
        for (const f of folded) expect(v.shownHands[Number(f)]).toBeUndefined();
      }
    }
    expect(seen).toBe(true);
  });
});


describe('human at the table', () => {
  it('bots act until the human\'s turn; human actions go through the engine', () => {
    const t = new Table({ ...cfg, botCount: 4, rng: seededRandomInt(8) });
    let humanTurns = 0;
    for (let h = 0; h < 40; h++) {
      if ((t.game.players[0]?.stack ?? 0) === 0) t.rebuyHuman();
      t.nextHand();
      while (t.game.isBetting) {
        expect(t.isHumanTurn).toBe(true);
        humanTurns++;
        const L = t.game.legalActions()!;
        t.humanAct({ type: L.canCheck ? 'check' : 'call' });
      }
      expect(t.game.players.reduce((s, p) => s + p.stack, 0)).toBe(t.buyIns.reduce((s, b) => s + b, 0));
    }
    expect(humanTurns).toBeGreaterThan(40);
  });
  it('busted human must rebuy before the next hand; net result accounts for it', () => {
    const t = new Table({ ...cfg, botCount: 3, rng: seededRandomInt(2) });
    t.nextHand();
    while (t.game.isBetting) t.humanAct({ type: 'fold' });
    t.game.players[0]!.stack = 0;                      // simulate a bust between hands
    expect(() => t.nextHand()).toThrow(/rebuy/);
    t.rebuyHuman();
    expect(t.buyIns[0]).toBe(2000);
    expect(() => t.nextHand()).not.toThrow();
    expect(t.net(0)).toBe((t.game.players[0]!.stack) - 2000);
  });
});
