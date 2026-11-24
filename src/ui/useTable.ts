import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Table } from '../engine/table';
import type { Action } from '../engine/game';

import type { TableSettings } from '../storage/settings';
export type Settings = TableSettings;

/**
 * Bridges the engine and React. Holds no game logic: it forwards human actions,
 * paces bot turns with a 0.6-2 s delay and re-renders after every mutation.
 */
export function useTable(settings: Settings) {
  const ref = useRef<Table | null>(null);
  if (!ref.current) ref.current = new Table(settings);
  const table = ref.current;
  const [version, bump] = useReducer((x: number) => x + 1, 0);

  const nextHand = useCallback(() => {
    if (table.game.isBetting) return;
    table.beginHand();
    bump();
  }, [table]);
  const act = useCallback((a: Action) => { table.submitHuman(a); bump(); }, [table]);
  const rebuy = useCallback(() => { table.rebuyHuman(); bump(); }, [table]);

  // Bot turns: one decision per timer tick.
  useEffect(() => {
    const g = table.game;
    if (!g.isBetting || g.toAct < 0 || !table.isBot(g.toAct)) return;
    const id = window.setTimeout(() => { table.stepBot(); bump(); }, table.thinkTime(g.toAct));
    return () => window.clearTimeout(id);
  }, [table, version]);

  useEffect(() => { nextHand(); }, [nextHand]);

  return { table, version, nextHand, act, rebuy };
}
