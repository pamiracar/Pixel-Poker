import { describe, expect, it } from 'vitest';
import { PokerGame } from '../src/engine/game';
import { Table } from '../src/engine/table';
import { cardToString, createDeck, parseCards, seededRandomInt } from '../src/engine/deck';
import { buildHandRecord, exportHistoryJson, observedProfiles, positionNames, type HandRecord } from '../src/stats/history';
import { buildReplay } from '../src/stats/replay';
import { balanceChartPath, emptyStats, summarize, updateStats, MAX_BALANCE_POINTS } from '../src/stats/stats';
import { HISTORY_KEY, MAX_HANDS, STATS_KEY, clearHistory, loadHistory, loadStats, memoryStore, recordHand, resetStats, type KVStore } from '../src/storage/storage';

function rig(holes: string[], board: string) {
  const cards = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(cards.map(cardToString));
  return () => [...cards, ...createDeck().filter((x) => !used.has(cardToString(x)))];
}
const mk = (stacks: number[], holes: string[], board = '2c 7d 9h Js 3c') => {
  const g = new PokerGame({ stacks, smallBlind: 10, bigBlind: 20, deckProvider: rig(holes, board) });
  g.startHand();
  return g;
};
const meta = { sessionId: 's1', id: 1, timestamp: 0 };
const checkdown = (g: PokerGame) => { while (g.isBetting) { const L = g.legalActions()!; g.act(L.playerId, { type: L.canCheck ? 'check' : 'call' }); } };

describe('hand records', () => {
  it('fold-win: only the human\'s own cards are stored, no showdown', () => {
    const g = mk([1000, 1000, 1000], ['Ah Kh', 'Qs Qd', 'Js Jd']);
    g.act(0, { type: 'fold' }); g.act(1, { type: 'fold' });
    const r = buildHandRecord(g, meta);
    expect(r.showdown).toBe(false);
    expect(r.players.find((p) => p.id === 0)!.hole).toHaveLength(2);
    expect(r.players.filter((p) => p.id !== 0).every((p) => p.hole === undefined)).toBe(true);
    expect(r.winners).toEqual([{ id: 2, amount: 20 }]);   // BB's uncalled 10 is refunded, not part of the contested pot
    expect(r.humanNet).toBe(0);
    expect(r.actions.map((a) => a.type)).toEqual(['fold', 'fold']);
    expect(r.humanHand).toBeUndefined();
  });
  it('showdown: shown hands are recorded with the winner and hand name; net matches the stacks', () => {
    const g = mk([1000, 1000], ['As Ad', 'Kh Kd']);
    g.act(0, { type: 'call' }); g.act(1, { type: 'check' });
    checkdown(g);
    const r = buildHandRecord(g, meta);
    expect(r.showdown).toBe(true);
    expect(r.players.every((p) => p.hole?.length === 2)).toBe(true);
    expect(r.winners).toEqual([{ id: 0, amount: 40, hand: 'One Pair' }]);
    expect(r.humanNet).toBe(20);
    expect(r.humanHand!.name).toBe('One Pair');
    expect(r.board).toHaveLength(5);
    expect(r.pot).toBe(40);
  });
  it('uncalled bets are refunded in the net result', () => {
    const g = mk([1000, 50, 1000], ['Kh Kd', 'As Ah', 'Qs Qd']);
    g.act(0, { type: 'raise', amount: 200 }); g.act(1, { type: 'call' }); g.act(2, { type: 'fold' });
    const r = buildHandRecord(g, meta);
    expect(r.humanNet).toBe(-50);
    expect(r.pot).toBe(120);
  });
  it('refuses to record an unfinished hand', () => {
    const g = mk([1000, 1000, 1000], ['Ah Kh', 'Qs Qd', 'Js Jd']);
    expect(() => buildHandRecord(g, meta)).toThrow();
  });
  it('position labels for 2-6 players', () => {
    const at = (m: number) => positionNames(0, Array.from({ length: m }, (_, i) => i), m);
    expect(at(2)).toEqual({ 0: 'BTN/SB', 1: 'BB' });
    expect(at(3)).toEqual({ 0: 'BTN', 1: 'SB', 2: 'BB' });
    expect(at(4)[3]).toBe('UTG');
    expect([at(5)[3], at(5)[4]]).toEqual(['UTG', 'CO']);
    expect([at(6)[3], at(6)[4], at(6)[5]]).toEqual(['UTG', 'MP', 'CO']);
    expect(positionNames(2, [0, 1, 2], 3)).toEqual({ 2: 'BTN', 0: 'SB', 1: 'BB' });
  });
});

function playedHands(n: number, seed = 4): HandRecord[] {
  const t = new Table({ botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20, humanAsBot: true, botSamples: 8, rng: seededRandomInt(seed) });
  const out: HandRecord[] = [];
  for (let h = 1; h <= n; h++) { t.nextHand(); out.push(buildHandRecord(t.game, { sessionId: 's1', id: h, timestamp: h })); }
  return out;
}
const hands = playedHands(80);

describe('replay', () => {
  it('every recorded hand replays consistently: chips conserved, board grows, ends at the recorded stacks', () => {
    for (const rec of hands) {
      const steps = buildReplay(rec);
      expect(steps).toHaveLength(rec.actions.length + 2);
      expect(steps[0]!.label).toMatch(/^Blinds/);
      const start = rec.players.reduce((s, p) => s + p.startStack, 0);
      let boardLen = 0;
      steps.forEach((s, i) => {
        const last = i === steps.length - 1;
        expect(s.final).toBe(last);
        expect(s.players.every((p) => p.stack >= 0)).toBe(true);
        if (!last) expect(s.players.reduce((a, p) => a + p.stack, 0) + s.pot).toBe(start);
        expect(s.board.length).toBeGreaterThanOrEqual(boardLen);
        boardLen = s.board.length;
      });
      const fin = steps[steps.length - 1]!;
      expect(fin.board).toHaveLength(rec.board.length);
      expect(fin.players.map((p) => p.stack)).toEqual(rec.players.map((p) => p.endStack));
      expect(fin.players.reduce((a, p) => a + p.stack, 0)).toBe(start);
    }
  });
  it('before the result only the human\'s cards are shown; other cards appear only if shown at showdown', () => {
    for (const rec of hands) {
      const steps = buildReplay(rec);
      for (const s of steps.slice(0, -1)) for (const p of s.players) if (p.id !== rec.humanId) expect(p.hole).toBeUndefined();
      const fin = steps[steps.length - 1]!;
      for (const p of fin.players) expect(p.hole !== undefined).toBe(p.id === rec.humanId || !!rec.players.find((x) => x.id === p.id)!.hole);
    }
  });
  it('describes actions in words', () => {
    const g = mk([1000, 1000], ['As Ad', 'Kh Kd']);
    g.act(0, { type: 'raise', amount: 60 }); g.act(1, { type: 'fold' });
    const labels = buildReplay(buildHandRecord(g, meta)).map((s) => s.label);
    expect(labels).toEqual(['Blinds 10/20', 'P0 raises to 60', 'P1 folds', 'P0 wins 40']);
  });
});

describe('statistics', () => {
  const stats = hands.reduce(updateStats, emptyStats());
  it('match an independent recount over all hands', () => {
    expect(stats.hands).toBe(80);
    expect(stats.net).toBe(hands.reduce((s, r) => s + r.humanNet, 0));
    expect(stats.wins).toBe(hands.filter((r) => r.winners.some((w) => w.id === 0)).length);
    expect(stats.vpip).toBe(hands.filter((r) => r.actions.some((a) => a.playerId === 0 && a.phase === 'PREFLOP' && ['call', 'bet', 'raise', 'allin'].includes(a.type))).length);
    expect(stats.showdowns).toBe(hands.filter((r) => r.showdown && !r.players.find((p) => p.id === 0)!.folded).length);
    expect(stats.balance).toHaveLength(80);
    expect(stats.balance[79]).toBe(stats.net);
    expect(stats.pfr).toBeLessThanOrEqual(stats.vpip);
    expect(stats.vpip).toBeLessThanOrEqual(stats.hands);
    expect(stats.showdownWins).toBeLessThanOrEqual(stats.showdowns);
    expect(stats.biggestPot).toBe(Math.max(0, ...hands.map((r) => r.winners.find((w) => w.id === 0)?.amount ?? 0)));
    const total = Object.values(stats.actions).reduce((a, b) => a + b, 0);
    expect(total).toBe(hands.reduce((s, r) => s + r.actions.filter((a) => a.playerId === 0).length, 0));
  });
  it('count VPIP and PFR the poker way (BB check is not voluntary, raise counts for both)', () => {
    const g = mk([1000, 1000], ['As Ad', 'Kh Kd']);
    g.act(0, { type: 'call' }); g.act(1, { type: 'check' });                // human limps, bot checks
    checkdown(g);
    const s1 = updateStats(emptyStats(), buildHandRecord(g, meta));
    expect([s1.vpip, s1.pfr, s1.wins, s1.showdowns, s1.showdownWins, s1.biggestPot]).toEqual([1, 0, 1, 1, 1, 40]);
    expect(s1.bestHand!.name).toBe('One Pair');
    const g2 = mk([1000, 1000], ['As Ad', 'Kh Kd']);
    g2.act(0, { type: 'raise', amount: 60 }); g2.act(1, { type: 'fold' });
    const s2 = updateStats(emptyStats(), buildHandRecord(g2, { ...meta, id: 2 }));
    expect([s2.vpip, s2.pfr, s2.showdowns, s2.wins]).toEqual([1, 1, 0, 1]);
    const g3 = mk([1000, 1000], ['As Ad', 'Kh Kd']);
    g3.act(0, { type: 'fold' });
    const s3 = updateStats(emptyStats(), buildHandRecord(g3, { ...meta, id: 3 }));
    expect([s3.vpip, s3.wins, s3.net]).toEqual([0, 0, -10]);
  });
  it('summaries never produce NaN, even with no hands', () => {
    for (const v of Object.values(summarize(emptyStats()))) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    expect(summarize(stats).winPct).toBeGreaterThanOrEqual(0);
  });
  it('balance history is capped', () => {
    let s = emptyStats();
    for (let i = 0; i < MAX_BALANCE_POINTS + 50; i++) s = updateStats(s, { ...hands[0]!, id: i });
    expect(s.balance).toHaveLength(MAX_BALANCE_POINTS);
    expect(s.hands).toBe(MAX_BALANCE_POINTS + 50);
  });
  it('observed bot profiles come from the recorded actions', () => {
    const p = observedProfiles(hands);
    expect(p.length).toBeGreaterThanOrEqual(4);
    for (const x of p) { expect(x.pfrPct).toBeLessThanOrEqual(x.vpipPct); expect(x.vpipPct).toBeLessThanOrEqual(100); expect(x.hands).toBeGreaterThan(0); }
    expect(observedProfiles([]).length).toBe(0);
  });
});

describe('balance chart', () => {
  it('draws a stepped path inside the box, also for empty and flat series', () => {
    for (const series of [[], [50], [0, 0, 0], [10, -30, 25, 100, -5]]) {
      const c = balanceChartPath(series, 320, 120);
      expect(c.path.startsWith('M')).toBe(true);
      expect(c.path.match(/H/g)?.length ?? 0).toBe(series.length);
      for (const n of c.path.match(/-?\d+/g)!) { expect(Number(n)).toBeGreaterThanOrEqual(0); expect(Number(n)).toBeLessThanOrEqual(320); }
      expect(c.zeroY).toBeGreaterThanOrEqual(0); expect(c.zeroY).toBeLessThanOrEqual(120);
      expect(c.min).toBeLessThan(c.max);
    }
  });
  it('higher balances are drawn higher up (smaller y)', () => {
    const c = balanceChartPath([100, -100], 320, 120);
    const ys = c.path.match(/V(-?\d+)/g)!.map((m) => Number(m.slice(1)));
    expect(ys[0]!).toBeLessThan(c.zeroY);
    expect(ys[1]!).toBeGreaterThan(c.zeroY);
  });
});

describe('persistence', () => {
  const rec = (id: number, session = 's1'): HandRecord => ({ ...hands[0]!, id, sessionId: session });
  it('keeps at most 500 hands, drops the oldest, ids keep increasing', () => {
    const store = memoryStore();
    for (let i = 0; i < 520; i++) recordHand(store, 's1', (id) => rec(id));
    const h = loadHistory(store);
    expect(h).toHaveLength(MAX_HANDS);
    expect(h[0]!.id).toBe(21);
    expect(h[499]!.id).toBe(520);
    expect(loadStats(store).all.hands).toBe(520);        // all-time stats are not truncated with the history
  });
  it('survives a "page reload": a new reader sees the same history and statistics', () => {
    const store = memoryStore();
    hands.slice(0, 10).forEach((r) => recordHand(store, 's1', (id) => ({ ...r, id })));
    const again = loadStats(store);
    expect(loadHistory(store)).toHaveLength(10);
    expect(again.all.hands).toBe(10);
    expect(again.session?.stats.hands).toBe(10);
    expect(again.all.net).toBe(hands.slice(0, 10).reduce((s, r) => s + r.humanNet, 0));
  });
  it('a new session starts empty while all-time statistics continue', () => {
    const store = memoryStore();
    recordHand(store, 's1', (id) => rec(id));
    recordHand(store, 's2', (id) => rec(id, 's2'));
    const st = loadStats(store);
    expect(st.session?.id).toBe('s2');
    expect(st.session?.stats.hands).toBe(1);
    expect(st.all.hands).toBe(2);
    expect(loadStats(store, 's3').session?.stats.hands).toBe(0);
  });
  it('reset statistics and clear history work independently', () => {
    const store = memoryStore();
    recordHand(store, 's1', (id) => rec(id));
    resetStats(store);
    expect(loadStats(store).all.hands).toBe(0);
    expect(loadHistory(store)).toHaveLength(1);
    clearHistory(store);
    expect(loadHistory(store)).toHaveLength(0);
  });
  it('tolerates corrupt or foreign data', () => {
    const store = memoryStore();
    store.setItem(HISTORY_KEY, '{not json'); store.setItem(STATS_KEY, '42');
    expect(loadHistory(store)).toEqual([]);
    expect(loadStats(store).all.hands).toBe(0);
    store.setItem(HISTORY_KEY, JSON.stringify([{ nope: 1 }, rec(7)]));
    expect(loadHistory(store).map((h) => h.id)).toEqual([7]);
  });
  it('a full browser quota drops old hands instead of failing', () => {
    const inner = memoryStore();
    const small: KVStore = { ...inner, setItem: (k, v) => { if (v.length > 30000) throw new Error('QuotaExceededError'); inner.setItem(k, v); } };
    for (let i = 0; i < 40; i++) expect(() => recordHand(small, 's1', (id) => rec(id))).not.toThrow();
    const kept = loadHistory(small);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(40);
    expect(kept[kept.length - 1]!.id).toBe(40);
  });
});

describe('export', () => {
  it('JSON export contains every hand and round-trips', () => {
    const text = exportHistoryJson(hands.slice(0, 5), new Date('2026-11-15T10:00:00Z'));
    const parsed = JSON.parse(text) as { game: string; version: number; exportedAt: string; hands: HandRecord[] };
    expect(parsed.game).toBe('Pixel Poker');
    expect(parsed.exportedAt).toBe('2026-11-15T10:00:00.000Z');
    expect(parsed.hands).toEqual(JSON.parse(JSON.stringify(hands.slice(0, 5))));
    for (const h of parsed.hands) { expect(h.board).toBeDefined(); expect(h.actions).toBeDefined(); expect(h.winners).toBeDefined(); expect(h.players.length).toBeGreaterThan(1); }
  });
});
