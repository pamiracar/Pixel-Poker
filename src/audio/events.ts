import type { ActionType, PokerGame, Phase } from '../engine/game';
import type { SoundName } from './sounds';

/** Everything needed to decide which sounds a state change deserves. */
export interface AudioSnapshot {
  hand: number; phase: Phase; boardLen: number; toAct: number;
  actions: ActionType[]; humanPayout: number; humanDealtIn: boolean; humanFolded: boolean;
}
export function snapshotOf(g: PokerGame): AudioSnapshot {
  const me = g.players[0]!;
  return {
    hand: g.handsPlayed, phase: g.phase, boardLen: g.board.length, toAct: g.toAct,
    actions: g.actionLog.map((a) => a.type),
    humanPayout: g.phase === 'PAYOUT' && g.outcome ? (g.outcome.payouts[0] ?? 0) : 0,
    humanDealtIn: me.inHand, humanFolded: me.folded,
  };
}

const FOR_ACTION: Record<ActionType, SoundName> = { fold: 'fold', check: 'check', call: 'chip', bet: 'raise', raise: 'raise', allin: 'allin' };

/** Pure: which sounds to play when the game moves from `prev` to `next` (at most a handful, in order). */
export function soundsForTransition(prev: AudioSnapshot | null, next: AudioSnapshot): SoundName[] {
  const out: SoundName[] = [];
  const newHand = !prev || prev.hand !== next.hand;
  if (newHand || next.boardLen > prev.boardLen) out.push('deal');
  const seen = newHand ? 0 : prev.actions.length;
  out.push(...next.actions.slice(seen).slice(-2).map((a) => FOR_ACTION[a]));
  if (next.toAct === 0 && (newHand || prev.toAct !== 0)) out.push('turn');
  if (next.phase === 'PAYOUT' && (newHand || prev.phase !== 'PAYOUT')) {
    if (next.humanPayout > 0) out.push('win');
    else if (next.humanDealtIn && !next.humanFolded) out.push('lose');
  }
  return out;
}
