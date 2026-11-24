import type { KVStore } from './storage';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '../audio/engine';

export interface TableSettings { botCount: number; startingStack: number; smallBlind: number; bigBlind: number }
export type AnimSetting = 'normal' | 'fast' | 'off';
export interface AppSettings { table: TableSettings; anim: AnimSetting; sound: AudioSettings; autoDeal: boolean }

export const SETTINGS_KEY = 'pixelPoker.settings.v1';
export const DEFAULT_TABLE: TableSettings = { botCount: 4, startingStack: 1000, smallBlind: 10, bigBlind: 20 };

/** Same rules the engine enforces, plus: 3-5 bots and at least 10 big blinds of stack. */
export function isValidTableSettings(t: TableSettings): boolean {
  const ints = [t.botCount, t.startingStack, t.smallBlind, t.bigBlind].every(Number.isInteger);
  return ints && t.botCount >= 3 && t.botCount <= 5 && t.smallBlind > 0 && t.bigBlind >= t.smallBlind
    && t.startingStack >= t.bigBlind * 10 && t.startingStack <= 1_000_000;
}

export function defaultSettings(reducedMotion = false): AppSettings {
  return { table: { ...DEFAULT_TABLE }, anim: reducedMotion ? 'off' : 'normal', sound: { ...DEFAULT_AUDIO_SETTINGS }, autoDeal: true };
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Turns anything read from storage into valid settings; unknown or broken values fall back to defaults. */
export function sanitizeSettings(raw: unknown, reducedMotion = false): AppSettings {
  const d = defaultSettings(reducedMotion);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as { table?: Partial<TableSettings>; anim?: unknown; sound?: Partial<AudioSettings>; autoDeal?: unknown };
  const t = r.table ?? {};
  const table: TableSettings = {
    botCount: num(t.botCount, 3, 5, d.table.botCount), startingStack: num(t.startingStack, 1, 1_000_000, d.table.startingStack),
    smallBlind: num(t.smallBlind, 1, 1_000_000, d.table.smallBlind), bigBlind: num(t.bigBlind, 1, 1_000_000, d.table.bigBlind),
  };
  const snd = r.sound ?? {};
  return {
    table: isValidTableSettings(table) ? table : d.table,
    autoDeal: bool(r.autoDeal, d.autoDeal),
    anim: r.anim === 'normal' || r.anim === 'fast' || r.anim === 'off' ? r.anim : d.anim,
    sound: {
      sfxOn: bool(snd.sfxOn, d.sound.sfxOn), sfxVolume: num(snd.sfxVolume, 0, 100, d.sound.sfxVolume),
      musicOn: bool(snd.musicOn, d.sound.musicOn), musicVolume: num(snd.musicVolume, 0, 100, d.sound.musicVolume),
    },
  };
}
export function loadSettings(store: KVStore, reducedMotion = false): AppSettings {
  try { return sanitizeSettings(JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null'), reducedMotion); }
  catch { return defaultSettings(reducedMotion); }
}
export function saveSettings(store: KVStore, s: AppSettings): void {
  try { store.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable: settings last for this session only */ }
}
