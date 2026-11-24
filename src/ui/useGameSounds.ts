import { useEffect, useRef } from 'react';
import type { PokerGame } from '../engine/game';
import { audio } from '../audio/engine';
import { snapshotOf, soundsForTransition, type AudioSnapshot } from '../audio/events';

/** Plays the sound effects for every state change of the game (cards, chips, actions, turn alert, win/lose). */
export function useGameSounds(game: PokerGame, version: number): void {
  const prev = useRef<AudioSnapshot | null>(null);
  useEffect(() => {
    const next = snapshotOf(game);
    soundsForTransition(prev.current, next).forEach((s, i) => audio.play(s, i * 0.1));
    prev.current = next;
  }, [game, version]);
}
