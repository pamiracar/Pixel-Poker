import type { Card } from '../engine/types';
import type { ActionRecord, PokerGame } from '../engine/game';
import { categoryName } from '../engine/handEvaluator';

export interface HandRecordPlayer {
  id: number; name: string; position: string; startStack: number; endStack: number; folded: boolean;
  /** Only the human's own cards and cards that were shown at showdown are ever recorded. */
  hole?: Card[];
}
export interface HandRecord {
  id: number; sessionId: string; handNo: number; timestamp: number;
  smallBlind: number; bigBlind: number; dealer: number; sbSeat: number; bbSeat: number;
  players: HandRecordPlayer[]; board: Card[]; actions: ActionRecord[];
  pot: number; showdown: boolean; winners: { id: number; amount: number; hand?: string }[];
  humanId: number; humanNet: number; humanHand?: { name: string; score: number };
}

/** BTN/SB/BB/UTG/MP/CO labels for the seats dealt in. Heads-up: the button is also the small blind. */
export function positionNames(dealer: number, ids: number[], tableSize: number): Record<number, string> {
  const order = [...ids].sort((a, b) => ((a - dealer + tableSize) % tableSize) - ((b - dealer + tableSize) % tableSize));
  const out: Record<number, string> = {};
  if (order.length === 2) { out[order[0]!] = 'BTN/SB'; out[order[1]!] = 'BB'; return out; }
  const rest = order.length - 3;
  const mid = rest <= 0 ? [] : rest === 1 ? ['UTG'] : ['UTG', ...Array<string>(rest - 2).fill('MP'), 'CO'];
  ['BTN', 'SB', 'BB', ...mid].forEach((label, i) => { if (order[i] !== undefined) out[order[i]!] = label; });
  return out;
}

/** Snapshot of a finished hand (phase PAYOUT). Hidden cards of folded/unshown players are not stored. */
export function buildHandRecord(g: PokerGame, meta: { sessionId: string; id: number; timestamp: number; humanId?: number }): HandRecord {
  const o = g.outcome;
  if (g.phase !== 'PAYOUT' || !o) throw new Error('Hand is not finished');
  const humanId = meta.humanId ?? 0;
  const dealt = g.players.filter((p) => p.inHand);
  const pos = positionNames(g.dealer, dealt.map((p) => p.id), g.players.length);
  const players = dealt.map((p): HandRecordPlayer => ({
    id: p.id, name: p.name, position: pos[p.id] ?? '', startStack: g.startStacks[p.id] ?? 0, endStack: p.stack, folded: p.folded,
    ...(p.id === humanId || o.hands[p.id] ? { hole: [...p.hole] } : {}),
  }));
  const me = players.find((p) => p.id === humanId);
  const myHand = o.hands[humanId];
  return {
    ...meta, humanId, handNo: g.handsPlayed, smallBlind: g.smallBlind, bigBlind: g.bigBlind,
    dealer: g.dealer, sbSeat: g.sbSeat, bbSeat: g.bbSeat, players, board: [...g.board],
    actions: g.actionLog.map((a) => ({ ...a })),
    pot: Object.values(o.payouts).reduce((s, x) => s + x, 0), showdown: o.showdown,
    winners: Object.entries(o.payouts).map(([id, amount]) => ({ id: Number(id), amount, ...(o.hands[Number(id)] ? { hand: categoryName(o.hands[Number(id)]!) } : {}) })),
    humanNet: me ? me.endStack - me.startStack : 0,
    ...(myHand ? { humanHand: { name: categoryName(myHand), score: myHand.score } } : {}),
  };
}

const VOLUNTARY = new Set(['call', 'bet', 'raise', 'allin']);
const AGGRESSIVE = new Set(['bet', 'raise', 'allin']);

/** Observed VPIP/PFR per bot (by name) over the given hands (use one session's hands). */
export function observedProfiles(hands: HandRecord[]): { name: string; hands: number; vpipPct: number; pfrPct: number }[] {
  const acc = new Map<string, { hands: number; vpip: number; pfr: number }>();
  for (const h of hands) {
    for (const p of h.players) {
      if (p.id === h.humanId) continue;
      const a = acc.get(p.name) ?? { hands: 0, vpip: 0, pfr: 0 };
      const pre = h.actions.filter((x) => x.playerId === p.id && x.phase === 'PREFLOP');
      a.hands++;
      if (pre.some((x) => VOLUNTARY.has(x.type))) a.vpip++;
      if (pre.some((x) => AGGRESSIVE.has(x.type))) a.pfr++;
      acc.set(p.name, a);
    }
  }
  return [...acc].map(([name, a]) => ({ name, hands: a.hands, vpipPct: Math.round((100 * a.vpip) / a.hands), pfrPct: Math.round((100 * a.pfr) / a.hands) }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

export function exportHistoryJson(hands: HandRecord[], now: Date = new Date()): string {
  return JSON.stringify({ game: 'Pixel Poker', version: 1, exportedAt: now.toISOString(), hands }, null, 2);
}
