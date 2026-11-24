import type { RandomInt } from '../engine/deck';

export type Archetype = 'TAG' | 'LAG' | 'ROCK' | 'STATION';
/** All parameters are 0..1. */
export interface Personality {
  archetype: Archetype;
  looseness: number;        // how wide a range of starting hands is played
  aggression: number;       // tendency to bet/raise instead of check/call
  bluffFrequency: number;   // base appetite for bluffs
  callDownTendency: number; // reluctance to fold a marginal hand
  foldToPressure: number;   // how readily weak hands fold to big bets
}
export const PERSONALITIES: Record<Archetype, Personality> = {
  TAG:     { archetype: 'TAG',     looseness: 0.30, aggression: 0.75, bluffFrequency: 0.20, callDownTendency: 0.40, foldToPressure: 0.50 },
  LAG:     { archetype: 'LAG',     looseness: 0.75, aggression: 0.90, bluffFrequency: 0.50, callDownTendency: 0.50, foldToPressure: 0.30 },
  ROCK:    { archetype: 'ROCK',    looseness: 0.15, aggression: 0.25, bluffFrequency: 0.05, callDownTendency: 0.35, foldToPressure: 0.70 },
  STATION: { archetype: 'STATION', looseness: 0.80, aggression: 0.15, bluffFrequency: 0.03, callDownTendency: 0.90, foldToPressure: 0.10 },
};
export const ARCHETYPES: Archetype[] = ['TAG', 'LAG', 'ROCK', 'STATION'];
export const BOT_NAMES = ['Rex', 'Mina', 'Bolt', 'Juno', 'Pixel', 'Zed', 'Nova', 'Kiko', 'Ace', 'Dash', 'Luna', 'Gus'];

/** Identity of a bot seat. The archetype is never shown to the player; avatar indexes a pixel avatar. */
export interface BotProfile { name: string; archetype: Archetype; avatar: number }

function pickShuffled<T>(items: readonly T[], rnd: RandomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j] as T, a[i] as T]; }
  return a;
}

/**
 * Random profiles for a table: unique names/avatars, and archetypes are shuffled so
 * every one of the four appears before any repeats. `forced` overrides archetypes (tests).
 */
export function assignBots(count: number, rnd: RandomInt, forced?: Archetype[]): BotProfile[] {
  const names = pickShuffled(BOT_NAMES.map((name, avatar) => ({ name, avatar })), rnd);
  const arch: Archetype[] = forced ? [...forced] : [];
  while (arch.length < count) arch.push(...pickShuffled(ARCHETYPES, rnd));
  return Array.from({ length: count }, (_, i) => ({ ...names[i]!, archetype: arch[i]! }));
}
