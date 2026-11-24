import { describe, expect, it } from 'vitest';
import { parseCards, seededRandomInt } from '../src/engine/deck';
import { boardWetness, detectDraws, estimateEquity, preflopStrength } from '../src/bots/equity';
import { makeBot, thinkTimeMs } from '../src/bots/botBrain';
import { ARCHETYPES, PERSONALITIES, assignBots, type Archetype } from '../src/bots/personalities';
import { Table } from '../src/engine/table';
import type { VisibleState } from '../src/engine/view';
import type { LegalActions } from '../src/engine/game';

/** Hand-built view for one decision: heads-up, we are seat 0, dealer is seat 1 (we are out of position). */
function view(o: { hole: string; board?: string; pot?: number; toCall?: number; stack?: number; oppStack?: number; opps?: number }): VisibleState {
  const stack = o.stack ?? 1000, toCall = o.toCall ?? 0, pot = o.pot ?? 100, bb = 20;
  const oppCount = o.opps ?? 1;
  const L: LegalActions = {
    playerId: 0, canFold: toCall > 0, canCheck: toCall === 0, canCall: toCall > 0, callAmount: Math.min(toCall, stack),
    canBet: toCall === 0, canRaise: toCall > 0 && stack > toCall, canAllIn: true,
    minRaiseTo: Math.min(stack, toCall === 0 ? bb : toCall + Math.max(bb, toCall)), maxRaiseTo: stack,
  };
  const pl = (id: number, st: number) => ({ id, name: `P${id}`, stack: st, bet: 0, totalBet: 0, folded: false, allIn: false, inHand: true });
  return {
    me: 0, hole: parseCards(o.hole), board: o.board ? parseCards(o.board) : [], phase: o.board ? 'FLOP' : 'PREFLOP', dealer: 1,
    pot, currentBet: toCall, minRaise: bb, smallBlind: 10, bigBlind: bb,
    players: [pl(0, stack), ...Array.from({ length: oppCount }, (_, i) => pl(i + 1, o.oppStack ?? 1000))],
    actions: [], legal: L, shownHands: {},
  };
}
function rate(a: Archetype, v: VisibleState, pred: (t: string) => boolean, trials = 600): number {
  const bot = makeBot(PERSONALITIES[a], { samples: 25 });
  const rnd = seededRandomInt(17);
  let n = 0;
  for (let i = 0; i < trials; i++) if (pred(bot(v, rnd).type)) n++;
  return n / trials;
}
const aggressive = (t: string) => t === 'bet' || t === 'raise' || t === 'allin';

describe('hand strength helpers', () => {
  it('preflop ordering', () => {
    const s = (h: string) => preflopStrength(parseCards(h));
    expect(s('As Ah')).toBeGreaterThan(s('Ks Kh'));
    expect(s('Ks Kh')).toBeGreaterThan(s('As Ks'));
    expect(s('As Ks')).toBeGreaterThan(s('As Kd'));
    expect(s('Js Ts')).toBeGreaterThan(s('7s 2d'));
    expect(s('As Ah')).toBeCloseTo(1, 1);
    expect(s('7s 2d')).toBeLessThan(0.1);
  });
  it('equity matches known values (AA vs one random hand ~85%, 72o ~35%)', () => {
    expect(estimateEquity(parseCards('As Ah'), [], 1, 3000, seededRandomInt(1))).toBeGreaterThan(0.82);
    expect(estimateEquity(parseCards('As Ah'), [], 1, 3000, seededRandomInt(1))).toBeLessThan(0.89);
    const e = estimateEquity(parseCards('7s 2d'), [], 1, 3000, seededRandomInt(2));
    expect(e).toBeGreaterThan(0.31); expect(e).toBeLessThan(0.40);
  });
  it('equity falls with more opponents and counts draws', () => {
    const hu = estimateEquity(parseCards('Ks Kh'), [], 1, 1500, seededRandomInt(3));
    const four = estimateEquity(parseCards('Ks Kh'), [], 4, 1500, seededRandomInt(3));
    expect(hu).toBeGreaterThan(four + 0.2);
    expect(estimateEquity(parseCards('As Ks'), parseCards('Qs Js 2c'), 1, 1500, seededRandomInt(4))).toBeGreaterThan(0.5);
  });
  it('detects flush draws, open-ended and gutshot straight draws, board wetness', () => {
    expect(detectDraws(parseCards('As Ks'), parseCards('Qs 2s 9c')).flush).toBe(true);
    expect(detectDraws(parseCards('9s 8h'), parseCards('7d 6c 2s')).straightOuts).toBe(2);
    expect(detectDraws(parseCards('9s 8h'), parseCards('7d 5c 2s')).straightOuts).toBe(1);
    expect(detectDraws(parseCards('9s 8h'), parseCards('7d 6c 5s')).straightOuts).toBe(0); // already a straight
    expect(boardWetness(parseCards('9s 8s 7s'))).toBeGreaterThan(boardWetness(parseCards('Ks 7d 2c')));
  });
});

describe('decision behaviour', () => {
  it('is randomized: a marginal spot produces more than one action', () => {
    const v = view({ hole: 'Ks 9d', board: '9c 4h 2s', pot: 100, toCall: 40 });
    const bot = makeBot(PERSONALITIES.TAG, { samples: 20 });
    const seen = new Set<string>();
    const rnd = seededRandomInt(5);
    for (let i = 0; i < 200; i++) seen.add(bot(v, rnd).type);
    expect(seen.size).toBeGreaterThan(1);
  });
  it('is reproducible with the same seed', () => {
    const v = view({ hole: 'Qs Jd', board: '9c 4h 2s' });
    const a = makeBot(PERSONALITIES.LAG, { samples: 20 })(v, seededRandomInt(9));
    const b = makeBot(PERSONALITIES.LAG, { samples: 20 })(v, seededRandomInt(9));
    expect(a).toEqual(b);
  });
  it('bluffs: LAG bets trash on a dry board heads-up far more than the station, rock and TAG; tight bots rarely', () => {
    const v = view({ hole: '7s 2d', board: 'Ks 8c 3h', pot: 100 });
    const lag = rate('LAG', v, aggressive), tag = rate('TAG', v, aggressive);
    const rock = rate('ROCK', v, aggressive), st = rate('STATION', v, aggressive);
    expect(lag).toBeGreaterThan(0.05);
    expect(lag).toBeGreaterThan(tag);
    expect(tag).toBeGreaterThan(rock);
    expect(st).toBeLessThan(0.03);
  });
  it('bluffs less multiway than heads-up', () => {
    const hu = rate('LAG', view({ hole: '7s 2d', board: 'Ks 8c 3h', opps: 1 }), aggressive);
    const multi = rate('LAG', view({ hole: '7s 2d', board: 'Ks 8c 3h', opps: 4 }), aggressive);
    expect(hu).toBeGreaterThan(multi);
  });
  it('semi-bluffs with a flush draw', () => {
    const v = view({ hole: 'As 5s', board: 'Ks 9s 2c', pot: 100 });
    expect(rate('LAG', v, aggressive)).toBeGreaterThan(0.4);
  });
  it('value bets monsters', () => {
    const v = view({ hole: 'As Ah', board: 'Ad 7c 2h', pot: 100 });
    expect(rate('TAG', v, aggressive)).toBeGreaterThan(0.7);
  });
  it('rock folds trash to a big bet, station calls it far more often', () => {
    const v = view({ hole: '7s 2d', board: 'Ks 8c 3h', pot: 100, toCall: 120 });
    const fold = (t: string) => t === 'fold';
    expect(rate('ROCK', v, fold)).toBeGreaterThan(0.85);
    expect(rate('STATION', v, fold)).toBeLessThan(rate('ROCK', v, fold) - 0.1);
  });
  it('plays push/fold when short stacked: AA shoves, 72o does not', () => {
    const aa = view({ hole: 'As Ah', stack: 160, oppStack: 160, pot: 30, toCall: 20 });
    const trash = view({ hole: '7s 2d', stack: 160, oppStack: 160, pot: 30, toCall: 20 });
    expect(rate('ROCK', aa, (t) => t === 'allin', 200)).toBeGreaterThan(0.95);
    expect(rate('TAG', trash, (t) => t === 'allin', 200)).toBeLessThan(0.05);
  });
  it('never folds when it can check, and always returns a legal-shaped action', () => {
    for (const a of ARCHETYPES) {
      const bot = makeBot(PERSONALITIES[a], { samples: 15 });
      const rnd = seededRandomInt(23);
      for (let i = 0; i < 100; i++) {
        const v = view({ hole: '8s 3d', board: i % 2 ? 'Ks 7c 2h' : undefined, toCall: 0 });
        const act = bot(v, rnd);
        expect(act.type).not.toBe('fold');
        if (act.type === 'bet') {
          expect(act.amount!).toBeGreaterThanOrEqual(v.legal!.minRaiseTo);
          expect(act.amount!).toBeLessThanOrEqual(v.legal!.maxRaiseTo);
        }
      }
    }
  });
});

describe('archetype play over full hands (VPIP / PFR)', () => {
  it('TAG, LAG, Rock and Station show clearly different VPIP and PFR', () => {
    const order: Archetype[] = ['TAG', 'LAG', 'ROCK', 'STATION', 'TAG'];
    const t = new Table({ botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20, humanAsBot: true, botSamples: 8,
      rng: seededRandomInt(31), archetypes: order });
    const stat = order.map(() => ({ dealt: 0, vpip: 0, pfr: 0 }));
    for (let h = 0; h < 600; h++) {
      t.nextHand();
      for (const p of t.game.players) {
        if (!p.inHand) continue;
        const acts = t.game.actionLog.filter((a) => a.playerId === p.id && a.phase === 'PREFLOP');
        const s = stat[p.id]!;
        s.dealt++;
        if (acts.some((a) => a.type === 'call' || aggressive(a.type))) s.vpip++;
        if (acts.some((a) => aggressive(a.type))) s.pfr++;
      }
    }
    const v = stat.map((s) => s.vpip / s.dealt), r = stat.map((s) => s.pfr / s.dealt);
    console.log('VPIP', order.map((a, i) => `${a}=${v[i]!.toFixed(2)}`).join(' '), '| PFR', order.map((a, i) => `${a}=${r[i]!.toFixed(2)}`).join(' '));
    const [tag, lag, rock, st] = [v[0]!, v[1]!, v[2]!, v[3]!];
    expect(st).toBeGreaterThan(tag);
    expect(lag).toBeGreaterThan(tag);
    expect(tag).toBeGreaterThan(rock);
    expect(r[1]!).toBeGreaterThan(r[2]!);    // LAG raises more than Rock
    expect(r[1]!).toBeGreaterThan(r[3]!);    // LAG raises more than Station
    expect(r[3]!).toBeLessThan(v[3]! * 0.6); // Station calls far more than it raises
  });
});

describe('table setup and think time', () => {
  it('assigns unique names/avatars and mixes archetypes randomly per table', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const p = assignBots(4, seededRandomInt(seed));
      expect(new Set(p.map((x) => x.name)).size).toBe(4);
      expect(new Set(p.map((x) => x.avatar)).size).toBe(4);
      expect(new Set(p.map((x) => x.archetype)).size).toBe(4); // all four archetypes at a 4-bot table
      sets.add(p.map((x) => x.archetype).join());
    }
    expect(sets.size).toBeGreaterThan(5);
    expect(assignBots(5, seededRandomInt(1))).toHaveLength(5);
  });
  it('think time is 0.6-2.0 s normally and longer (max 3 s) for big decisions', () => {
    const rnd = seededRandomInt(1);
    for (let i = 0; i < 300; i++) {
      const easy = thinkTimeMs(view({ hole: 'As Kd', toCall: 0 }), rnd);
      expect(easy).toBeGreaterThanOrEqual(600); expect(easy).toBeLessThanOrEqual(2000);
      const hard = thinkTimeMs(view({ hole: 'As Kd', toCall: 500, pot: 200 }), rnd);
      expect(hard).toBeGreaterThanOrEqual(600); expect(hard).toBeLessThanOrEqual(3000);
    }
    const avg = (f: () => number) => Array.from({ length: 300 }, f).reduce((a, b) => a + b, 0) / 300;
    expect(avg(() => thinkTimeMs(view({ hole: 'As Kd', toCall: 500, pot: 200 }), rnd))).toBeGreaterThan(avg(() => thinkTimeMs(view({ hole: 'As Kd' }), rnd)) + 200);
  });
  it('the human seat has no profile; the archetype is not part of the visible state', () => {
    const t = new Table({ botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20, botSamples: 8, rng: seededRandomInt(2) });
    expect(t.profiles[0]).toBeUndefined();
    expect(t.game.players.map((p) => p.name)[0]).toBe('You');
  });
});
