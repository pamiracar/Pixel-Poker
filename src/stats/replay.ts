import type { Card } from '../engine/types';
import type { HandRecord } from './history';

export interface ReplayPlayer { id: number; name: string; position: string; stack: number; bet: number; folded: boolean; allIn: boolean; hole?: Card[] }
export interface ReplayStep { label: string; board: Card[]; pot: number; players: ReplayPlayer[]; actingId: number | null; final: boolean }

const BOARD_LEN: Record<string, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

/**
 * Rebuilds a recorded hand action by action: blinds, every action with stacks/bets/pot,
 * then the result. Before the result, only the human's own cards are visible.
 */
export function buildReplay(rec: HandRecord): ReplayStep[] {
  const ps = rec.players.map((p) => ({ id: p.id, name: p.name, position: p.position, stack: p.startStack, bet: 0, folded: false, allIn: false }));
  let paid = 0;
  let phase = 'PREFLOP';
  const find = (id: number) => ps.find((p) => p.id === id)!;
  const pay = (id: number, x: number): number => {
    const p = find(id);
    const d = Math.max(0, Math.min(x, p.stack));
    p.stack -= d; p.bet += d; paid += d;
    if (p.stack === 0) p.allIn = true;
    return d;
  };
  const snap = (label: string, actingId: number | null, final = false): ReplayStep => ({
    label, actingId, final, pot: paid, board: rec.board.slice(0, final ? rec.board.length : BOARD_LEN[phase] ?? 0),
    players: ps.map((p) => ({ ...p, ...(rec.players.find((r) => r.id === p.id)?.hole && (final || p.id === rec.humanId) ? { hole: rec.players.find((r) => r.id === p.id)!.hole! } : {}) })),
  });

  pay(rec.sbSeat, rec.smallBlind); pay(rec.bbSeat, rec.bigBlind);
  const steps: ReplayStep[] = [snap(`Blinds ${rec.smallBlind}/${rec.bigBlind}`, null)];
  for (const a of rec.actions) {
    if (a.phase !== phase) { phase = a.phase; ps.forEach((p) => { p.bet = 0; }); }
    const p = find(a.playerId);
    let label: string;
    if (a.type === 'fold') { p.folded = true; label = `${p.name} folds`; }
    else if (a.type === 'check') label = `${p.name} checks`;
    else {
      const d = pay(a.playerId, a.amount - p.bet);
      label = a.type === 'call' ? `${p.name} calls ${d}` : a.type === 'bet' ? `${p.name} bets ${a.amount}` : a.type === 'raise' ? `${p.name} raises to ${a.amount}` : `${p.name} all-in ${a.amount}`;
    }
    steps.push(snap(label, a.playerId));
  }
  // Result: final stacks (they include any refunded uncalled bet), full board, winners.
  ps.forEach((p) => { const r = rec.players.find((x) => x.id === p.id)!; p.stack = r.endStack; p.bet = 0; p.folded = r.folded; p.allIn = false; });
  const names = rec.winners.map((w) => `${find(w.id).name} wins ${w.amount}${w.hand ? ` (${w.hand})` : ''}`).join(', ');
  steps.push(snap(names || 'Hand over', null, true));
  return steps;
}
