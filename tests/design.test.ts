import { describe, expect, it } from 'vitest';
import { STAGE_H, STAGE_W, fitScale } from '../src/ui/layout';
import { pixelRoundRect, polygonCss } from '../src/ui/shape';
import { snapBet, sizingPresets } from '../src/ui/sizing';
import { FELT_H, FELT_W, lastActionLabels, seatPosition } from '../src/ui/anim';
import { CHIP_GRID, CHIP_H, CHIP_W, CHIP_DENOMS, CHIP_STYLE, chipColor, shade } from '../src/ui/pixel/data';

describe('stage scaling', () => {
  it('fits the 1280x720 stage into any window without cropping, keeping the proportions', () => {
    for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [800, 600], [2560, 1080], [390, 844]]) {
      const s = fitScale(w!, h!);
      expect(STAGE_W * s).toBeLessThanOrEqual(w! + 1e-6);
      expect(STAGE_H * s).toBeLessThanOrEqual(h! + 1e-6);
      expect(Math.abs(STAGE_W * s - w!) < 1e-6 || Math.abs(STAGE_H * s - h!) < 1e-6).toBe(true);   // touches at least one edge
    }
    expect(fitScale(1280, 720)).toBe(1);
    expect(fitScale(0, 0)).toBeGreaterThan(0);
  });
});

describe('pixel-stepped table outline', () => {
  const pts = pixelRoundRect(1200, 520, 240, 200, 8);
  it('stays inside the box, is mirror-symmetric and snapped to the pixel grid', () => {
    expect(pts.length).toBeGreaterThan(100);
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1200); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(520); expect(y % 8 === 0 || y === 520 - ((520 - y) % 8) || (520 - y) % 8 === 0).toBe(true); }
    const key = (p: [number, number]) => `${p[0]},${p[1]}`;
    const set = new Set(pts.map(key));
    for (const [x, y] of pts) expect(set.has(key([1200 - x, y])), `${x},${y}`).toBe(true);
    expect(Math.min(...pts.map((p) => p[1]))).toBe(0);
    expect(polygonCss(pts.slice(0, 2))).toBe(`polygon(${pts[0]![0]}px ${pts[0]![1]}px,${pts[1]![0]}px ${pts[1]![1]}px)`);
  });
  it('corners are cut: the top-left starts well below the top edge', () => {
    expect(pts[0]![1]).toBeGreaterThan(100);
  });
});

describe('bet sizing presets', () => {
  const base = { currentBet: 0, myBet: 0, bigBlind: 20, pot: 100, min: 20, max: 1000, step: 10 };
  it('snaps to the chip step but keeps min and all-in exact', () => {
    expect(snapBet(47, 20, 1000, 10)).toBe(50);
    expect(snapBet(5, 20, 1000, 10)).toBe(20);
    expect(snapBet(2000, 20, 997, 10)).toBe(997);
    expect(snapBet(995, 20, 997, 10)).toBe(997);   // rounds up to 1000, which is above the stack, so it becomes the all-in amount
    expect(snapBet(993, 20, 997, 10)).toBe(990);
  });
  it('preflop first raise: multiples of the big blind; re-raise: multiples of the current bet', () => {
    const open = sizingPresets({ ...base, phase: 'PREFLOP', currentBet: 20, myBet: 0, min: 40 });
    expect(open).toEqual([{ label: '2.5x', to: 50 }, { label: '3x', to: 60 }, { label: '4x', to: 80 }]);
    const re = sizingPresets({ ...base, phase: 'PREFLOP', currentBet: 60, myBet: 0, min: 100 });
    expect(re.map((p) => p.to)).toEqual([120, 180, 240]);
  });
  it('postflop: pot fractions of the pot after calling; never below min or at all-in; no duplicates', () => {
    const r = sizingPresets({ ...base, phase: 'FLOP', pot: 300 });
    expect(r.map((p) => p.label)).toEqual(['1/3', '1/2', '2/3', 'POT']);
    expect(r.map((p) => p.to)).toEqual([100, 150, 200, 300]);
    const tiny = sizingPresets({ ...base, phase: 'FLOP', pot: 30 });
    expect(new Set(tiny.map((p) => p.to)).size).toBe(tiny.length);
    for (const p of tiny) { expect(p.to).toBeGreaterThan(20); expect(p.to).toBeLessThan(1000); }
    expect(sizingPresets({ ...base, phase: 'FLOP', pot: 300, max: 100 }).every((p) => p.to < 100)).toBe(true);
  });
});

describe('seat action labels', () => {
  const log = [
    { playerId: 2, phase: 'PREFLOP' as const, type: 'raise' as const, amount: 60 },
    { playerId: 3, phase: 'PREFLOP' as const, type: 'fold' as const, amount: 0 },
    { playerId: 0, phase: 'PREFLOP' as const, type: 'call' as const, amount: 60 },
    { playerId: 0, phase: 'FLOP' as const, type: 'check' as const, amount: 0 },
    { playerId: 2, phase: 'FLOP' as const, type: 'bet' as const, amount: 40 },
    { playerId: 0, phase: 'FLOP' as const, type: 'allin' as const, amount: 900 },
  ];
  it('shows the latest action of the current street only', () => {
    expect(lastActionLabels(log, 'PREFLOP')).toEqual({ 2: 'RAISE 60', 3: 'FOLD', 0: 'CALL 60' });
    expect(lastActionLabels(log, 'FLOP')).toEqual({ 0: 'ALL-IN 900', 2: 'BET 40' });
    expect(lastActionLabels(log, 'TURN')).toEqual({});
  });
  it('after the hand ends, the last street stays visible', () => {
    expect(lastActionLabels(log, 'PAYOUT')[0]).toBe('ALL-IN 900');
    expect(lastActionLabels([], 'PAYOUT')).toEqual({});
  });
});

describe('chip art and table geometry', () => {
  it('chip sprite is 15x17: outline, edge stripes, ring, body, center and an edge below', () => {
    expect(CHIP_GRID).toHaveLength(CHIP_H);
    CHIP_GRID.forEach((r) => expect(r).toMatch(new RegExp(`^[.orblsc]{${CHIP_W}}$`)));
    const all = CHIP_GRID.join('');
    for (const ch of 'orblsc') expect(all, ch).toContain(ch);
    expect(CHIP_GRID[0]![0]).toBe('.');
    expect(CHIP_GRID[7]![7]).toBe('c');
    expect(CHIP_GRID[CHIP_H - 1]!.includes('o')).toBe(true);   // the thick edge shows below the face
  });
  it('colors: every value has a distinct body, the edge is a darker shade', () => {
    expect(new Set(CHIP_DENOMS.map((d) => CHIP_STYLE[d]!.body)).size).toBe(CHIP_DENOMS.length);
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    for (const d of CHIP_DENOMS) expect(chipColor(d, 's')).not.toBe(chipColor(d, 'b'));
  });
  it('the 6-seat ring fits inside the felt with room for the seat groups', () => {
    for (const n of [4, 5, 6]) for (let k = 0; k < n; k++) {
      const p = seatPosition(k, n);
      expect(p.x / 100 * FELT_W).toBeGreaterThan(90); expect(p.x / 100 * FELT_W).toBeLessThan(FELT_W - 90);
      expect(p.y / 100 * FELT_H).toBeGreaterThan(65); expect(p.y / 100 * FELT_H).toBeLessThan(FELT_H - 65);
    }
  });
});
