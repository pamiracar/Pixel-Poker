/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PokerGame } from '../src/engine/game';
import { Table } from '../src/engine/table';
import { cardToString, createDeck, parseCards, seededRandomInt } from '../src/engine/deck';
import { AudioEngine } from '../src/audio/engine';
import { PALETTE, blend, contrastRatio } from '../src/ui/palette';
import { FELT_H, FELT_W } from '../src/ui/anim';
import { DEFAULT_TABLE, SETTINGS_KEY, defaultSettings, isValidTableSettings, loadSettings, sanitizeSettings, saveSettings } from '../src/storage/settings';
import { memoryStore } from '../src/storage/storage';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

function rig(holes: string[], board: string) {
  const cards = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const used = new Set(cards.map(cardToString));
  return () => [...cards, ...createDeck().filter((x) => !used.has(cardToString(x)))];
}

describe('engine input validation', () => {
  const ok = { stacks: [1000, 1000], smallBlind: 10, bigBlind: 20 };
  it('rejects fractional or non-positive blinds, negative stacks and bad table sizes', () => {
    expect(() => new PokerGame(ok)).not.toThrow();
    expect(() => new PokerGame({ ...ok, smallBlind: 0.5 })).toThrow();
    expect(() => new PokerGame({ ...ok, smallBlind: 0 })).toThrow();
    expect(() => new PokerGame({ ...ok, bigBlind: 5 })).toThrow();
    expect(() => new PokerGame({ ...ok, stacks: [1000, -1] })).toThrow();
    expect(() => new PokerGame({ ...ok, stacks: [1000.5, 1000] })).toThrow();
    expect(() => new PokerGame({ ...ok, stacks: [1000] })).toThrow();
    expect(() => new PokerGame({ ...ok, stacks: Array(7).fill(1000) })).toThrow();
  });
});

describe('more poker edge cases', () => {
  it('a tie for a side pot splits only that pot; the short stack still wins the main pot', () => {
    const g = new PokerGame({ stacks: [100, 300, 300], smallBlind: 10, bigBlind: 20, deckProvider: rig(['As Ah', 'Ks Kh', 'Kd Kc'], '2c 7d 9h Js 3s') });
    g.startHand();
    g.act(0, { type: 'allin' }); g.act(1, { type: 'allin' }); g.act(2, { type: 'call' });
    expect(g.players.map((p) => p.stack)).toEqual([300, 200, 200]);
    expect(g.outcome!.pots.map((p) => p.winners)).toEqual([[0], [1, 2]]);
  });
  it('heads-up with both blinds short: automatic all-in, board runs out, chips conserved', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new PokerGame({ stacks: [5, 8], smallBlind: 10, bigBlind: 20, rng: seededRandomInt(seed) });
      g.startHand();
      expect(g.phase).toBe('PAYOUT');
      expect(g.board).toHaveLength(5);
      expect(g.players.reduce((s, p) => s + p.stack, 0)).toBe(13);
    }
  });
  it('the whole engine is deterministic for a given seed', () => {
    const run = () => {
      const t = new Table({ botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20, humanAsBot: true, botSamples: 8, rng: seededRandomInt(77) });
      for (let h = 0; h < 40; h++) t.nextHand();
      return JSON.stringify([t.game.players.map((p) => [p.stack, p.rebuys]), t.profiles.map((p) => p?.archetype), t.game.board.map(cardToString)]);
    };
    expect(run()).toBe(run());
  });
});

describe('settings', () => {
  it('validates table settings (whole numbers, 3-5 bots, BB >= SB, stack >= 10 BB)', () => {
    expect(isValidTableSettings(DEFAULT_TABLE)).toBe(true);
    for (const bad of [{ botCount: 2 }, { botCount: 6 }, { smallBlind: 0 }, { smallBlind: 25 }, { bigBlind: 5 }, { startingStack: 199 }, { smallBlind: 2.5 }, { startingStack: NaN }]) {
      expect(isValidTableSettings({ ...DEFAULT_TABLE, ...bad }), JSON.stringify(bad)).toBe(false);
    }
    expect(isValidTableSettings({ ...DEFAULT_TABLE, startingStack: 200 })).toBe(true);
  });
  it('falls back to defaults for garbage, clamps volumes, repairs invalid combinations', () => {
    for (const junk of [null, 42, 'x', [], {}, { table: 5, sound: 'loud', anim: 9 }]) expect(sanitizeSettings(junk)).toEqual(defaultSettings());
    const s = sanitizeSettings({ table: { botCount: 5, startingStack: 5000, smallBlind: 25, bigBlind: 50 }, anim: 'fast', sound: { sfxOn: false, sfxVolume: 250, musicOn: 'yes', musicVolume: 10 } });
    expect(s.table).toEqual({ botCount: 5, startingStack: 5000, smallBlind: 25, bigBlind: 50 });
    expect([s.anim, s.sound.sfxOn, s.sound.sfxVolume, s.sound.musicOn, s.sound.musicVolume]).toEqual(['fast', false, defaultSettings().sound.sfxVolume, true, 10]);
    expect(sanitizeSettings({ table: { botCount: 4, startingStack: 100, smallBlind: 10, bigBlind: 20 } }).table).toEqual(DEFAULT_TABLE);
  });
  it('round-trips through storage, survives corrupt data, and honors reduced motion only as a default', () => {
    const store = memoryStore();
    expect(loadSettings(store).anim).toBe('normal');
    expect(loadSettings(store, true).anim).toBe('off');
    const custom = { ...defaultSettings(), anim: 'fast' as const, table: { botCount: 3, startingStack: 2000, smallBlind: 5, bigBlind: 10 } };
    saveSettings(store, custom);
    expect(loadSettings(store, true)).toEqual(custom);          // an explicit saved choice wins
    store.setItem(SETTINGS_KEY, '{oops');
    expect(loadSettings(store)).toEqual(defaultSettings());
  });
});

describe('accessibility', () => {
  it('stylesheet colors match the palette module', () => {
    const vars: Record<string, string> = { bg: '--bg', panel: '--panel', ink: '--ink', felt: '--felt', felt2: '--felt2', wood: '--wood', gold: '--gold', red: '--red', cardRed: '--card-red', blue: '--blue' };
    for (const [key, name] of Object.entries(vars)) {
      const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
      expect(m?.[1]?.toLowerCase(), name).toBe(PALETTE[key as keyof typeof PALETTE]);
    }
  });
  it('text and symbols have enough contrast (WCAG AA 4.5:1 for text)', () => {
    const P = PALETTE;
    const pairs: [string, string, string][] = [
      ['ink on bg', P.ink, P.bg], ['ink on panel', P.ink, P.panel], ['gold on bg', P.gold, P.bg], ['gold on panel', P.gold, P.panel],
      ['red suits on card face', P.cardRed, P.ink], ['black suits on card face', '#111111', P.ink],
      ['muted text on panel', blend(P.ink, P.panel, 0.7), P.panel], ['muted text on bg', blend(P.ink, P.bg, 0.7), P.bg],
    ];
    for (const [name, fg, bg] of pairs) expect(contrastRatio(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('keyboard focus, reduced motion and a screen-reader live region are provided', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('.sr-only');
  });
  it('a missing Web Audio API never breaks the game', () => {
    const e = new AudioEngine(() => { throw new Error('no Web Audio'); });
    expect(() => { e.unlock(); e.play('win'); e.setSettings(defaultSettings().sound); e.tickMusic(); }).not.toThrow();
    expect(e.unlocked).toBe(false);
  });
});

describe('layout constants', () => {
  it('the felt size in CSS matches the constants used by the animations', () => {
    expect(css).toMatch(new RegExp(`\\.felt \\{[^}]*width:\\s*${FELT_W}px[^}]*height:\\s*${FELT_H}px`));
  });
});

describe('card sizing', () => {
  it('cards use fixed design sizes (the stage scales them), with their own classes for board, seats and the player', () => {
    expect(css).not.toMatch(/\.card \{ zoom/);
    for (const c of ['.card.small', '.card.hero', '.card .rank', '.card .bigsuit']) expect(css).toContain(c);
  });
});
