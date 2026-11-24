import type { HandRecord } from './history';

export interface StatsData {
  hands: number; wins: number; net: number; vpip: number; pfr: number;
  showdowns: number; showdownWins: number; biggestPot: number;
  bestHand: { score: number; name: string; handId: number } | null;
  actions: { fold: number; check: number; call: number; raise: number };
  /** Cumulative net chips after each hand (last MAX_BALANCE_POINTS hands). */
  balance: number[];
}
export const MAX_BALANCE_POINTS = 1000;

export const emptyStats = (): StatsData => ({
  hands: 0, wins: 0, net: 0, vpip: 0, pfr: 0, showdowns: 0, showdownWins: 0, biggestPot: 0, bestHand: null,
  actions: { fold: 0, check: 0, call: 0, raise: 0 }, balance: [],
});

/** Folds one finished hand into the running statistics (pure; returns a new object). */
export function updateStats(s: StatsData, r: HandRecord): StatsData {
  const me = r.players.find((p) => p.id === r.humanId);
  if (!me) return s;
  const mine = r.actions.filter((a) => a.playerId === r.humanId);
  const pre = mine.filter((a) => a.phase === 'PREFLOP');
  const payout = r.winners.find((w) => w.id === r.humanId)?.amount ?? 0;
  const atShowdown = r.showdown && !me.folded;
  const actions = { ...s.actions };
  for (const a of mine) {
    if (a.type === 'fold') actions.fold++;
    else if (a.type === 'check') actions.check++;
    else if (a.type === 'call') actions.call++;
    else actions.raise++;
  }
  const net = s.net + r.humanNet;
  const better = r.humanHand && atShowdown && (!s.bestHand || r.humanHand.score > s.bestHand.score);
  return {
    hands: s.hands + 1, wins: s.wins + (payout > 0 ? 1 : 0), net,
    vpip: s.vpip + (pre.some((a) => a.type === 'call' || a.type === 'bet' || a.type === 'raise' || a.type === 'allin') ? 1 : 0),
    pfr: s.pfr + (pre.some((a) => a.type === 'bet' || a.type === 'raise' || a.type === 'allin') ? 1 : 0),
    showdowns: s.showdowns + (atShowdown ? 1 : 0), showdownWins: s.showdownWins + (atShowdown && payout > 0 ? 1 : 0),
    biggestPot: Math.max(s.biggestPot, payout),
    bestHand: better ? { score: r.humanHand!.score, name: r.humanHand!.name, handId: r.id } : s.bestHand,
    actions, balance: [...s.balance, net].slice(-MAX_BALANCE_POINTS),
  };
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);
/** Display numbers (percentages are 0 when there is nothing to divide by, never NaN). */
export function summarize(s: StatsData) {
  const acts = s.actions.fold + s.actions.check + s.actions.call + s.actions.raise;
  return {
    hands: s.hands, wins: s.wins, winPct: pct(s.wins, s.hands), net: s.net,
    vpipPct: pct(s.vpip, s.hands), pfrPct: pct(s.pfr, s.hands),
    showdownPct: pct(s.showdowns, s.hands), showdownWinPct: pct(s.showdownWins, s.showdowns),
    biggestPot: s.biggestPot, bestHand: s.bestHand?.name ?? '-',
    foldPct: pct(s.actions.fold, acts), callPct: pct(s.actions.call + s.actions.check, acts), raisePct: pct(s.actions.raise, acts),
  };
}

/** Stepped (pixel-style) line chart path for the balance over time, starting from 0. */
export function balanceChartPath(series: number[], w: number, h: number, pad = 4): { path: string; zeroY: number; min: number; max: number } {
  const vals = [0, ...series];
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max += 1; min -= 1; }
  const x = (i: number) => Math.round(pad + (vals.length === 1 ? 0 : (i * (w - 2 * pad)) / (vals.length - 1)));
  const y = (v: number) => Math.round(pad + ((max - v) * (h - 2 * pad)) / (max - min));
  let path = `M${x(0)} ${y(vals[0]!)}`;
  for (let i = 1; i < vals.length; i++) path += `H${x(i)}V${y(vals[i]!)}`;
  return { path, zeroY: y(0), min, max };
}
