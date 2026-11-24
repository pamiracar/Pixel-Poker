import type { Card } from './types';
import type { ActionRecord, LegalActions, Phase, PokerGame } from './game';

export interface PublicPlayer {
  id: number; name: string; stack: number; bet: number; totalBet: number;
  folded: boolean; allIn: boolean; inHand: boolean;
}
/**
 * Everything one player is allowed to know. This is the ONLY input bots receive:
 * own hole cards, public table state and the public action history. No deck,
 * no opponents' hole cards (those appear in `shownHands` only after a showdown).
 */
export interface VisibleState {
  me: number; hole: Card[]; board: Card[]; phase: Phase; dealer: number;
  pot: number; currentBet: number; minRaise: number; smallBlind: number; bigBlind: number;
  players: PublicPlayer[]; actions: ActionRecord[];
  legal: LegalActions | null;
  shownHands: Record<number, Card[]>;
}

/** Builds a defensive copy of the game as seen by player `me`. */
export function visibleState(g: PokerGame, me: number): VisibleState {
  const mp = g.players[me];
  if (!mp) throw new Error(`No such player ${me}`);
  const shownHands: Record<number, Card[]> = {};
  if (g.outcome?.showdown) {
    for (const id of Object.keys(g.outcome.hands)) shownHands[Number(id)] = [...(g.players[Number(id)]?.hole ?? [])];
  }
  return {
    me, hole: [...mp.hole], board: [...g.board], phase: g.phase, dealer: g.dealer,
    pot: g.pot, currentBet: g.currentBet, minRaise: g.minRaise,
    smallBlind: g.smallBlind, bigBlind: g.bigBlind,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, stack: p.stack, bet: p.bet, totalBet: p.totalBet,
      folded: p.folded, allIn: p.allIn, inHand: p.inHand,
    })),
    actions: g.actionLog.map((a) => ({ ...a })),
    legal: g.toAct === me && g.legalActions() ? { ...g.legalActions()! } : null,
    shownHands,
  };
}
