import type { HandRecord } from '../stats/history';
import { emptyStats, updateStats, type StatsData } from '../stats/stats';

export interface KVStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const HISTORY_KEY = 'pixelPoker.history.v1';
export const STATS_KEY = 'pixelPoker.stats.v1';
export const MAX_HANDS = 500;

export function memoryStore(): KVStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
/** localStorage when available (it can be blocked, e.g. private mode), otherwise an in-memory fallback. */
export function browserStore(): KVStore {
  try {
    const s = window.localStorage;
    s.setItem('__pp_test', '1'); s.removeItem('__pp_test');
    return s;
  } catch { return memoryStore(); }
}

const looksLikeHand = (h: unknown): h is HandRecord => {
  const r = h as Partial<HandRecord> | null;
  return !!r && typeof r.id === 'number' && Array.isArray(r.players) && Array.isArray(r.actions) && Array.isArray(r.board);
};
export function loadHistory(store: KVStore): HandRecord[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(looksLikeHand) : [];
  } catch { return []; }
}
/** Saves, dropping the oldest hands if the browser quota is exceeded. Returns what was actually kept. */
function saveHistory(store: KVStore, hands: HandRecord[]): HandRecord[] {
  let list = hands.slice(-MAX_HANDS);
  for (;;) {
    try { store.setItem(HISTORY_KEY, JSON.stringify(list)); return list; }
    catch { if (list.length <= 1) return list; list = list.slice(Math.ceil(list.length * 0.1)); }
  }
}
export function clearHistory(store: KVStore): void { store.removeItem(HISTORY_KEY); }

export interface StoredStats { all: StatsData; session: { id: string; stats: StatsData } | null }
const validStats = (s: unknown): s is StatsData => !!s && typeof (s as StatsData).hands === 'number' && Array.isArray((s as StatsData).balance) && !!(s as StatsData).actions;

/** `sessionId` given: a different stored session is replaced by an empty one. Omitted: stored session is kept as is. */
export function loadStats(store: KVStore, sessionId?: string): StoredStats {
  let out: StoredStats = { all: emptyStats(), session: null };
  try {
    const p = JSON.parse(store.getItem(STATS_KEY) ?? 'null') as Partial<StoredStats> | null;
    if (p && validStats(p.all)) out = { all: p.all, session: p.session && typeof p.session.id === 'string' && validStats(p.session.stats) ? p.session : null };
  } catch { /* corrupt data: start fresh */ }
  if (sessionId !== undefined && out.session?.id !== sessionId) out = { ...out, session: { id: sessionId, stats: emptyStats() } };
  return out;
}
function saveStats(store: KVStore, s: StoredStats): void { try { store.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* quota: keep playing */ } }
export function resetStats(store: KVStore): void { store.removeItem(STATS_KEY); }

export const nextHandId = (hands: HandRecord[]): number => (hands[hands.length - 1]?.id ?? 0) + 1;

/** Stores one finished hand and updates both the all-time and the session statistics. */
export function recordHand(store: KVStore, sessionId: string, build: (id: number) => HandRecord): { history: HandRecord[]; stats: StoredStats } {
  const loaded = loadHistory(store);
  const rec = build(nextHandId(loaded));
  const history = saveHistory(store, [...loaded, rec]);
  const cur = loadStats(store, sessionId);
  const stats: StoredStats = { all: updateStats(cur.all, rec), session: { id: sessionId, stats: updateStats(cur.session!.stats, rec) } };
  saveStats(store, stats);
  return { history, stats };
}
