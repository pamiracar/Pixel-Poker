import { describe, expect, it } from 'vitest';
import { CENTER, betPosition, planBetFlights, seatPosition } from '../src/ui/anim';
import { chipSet, launchChip, stepChip, type Chip } from '../src/ui/chipPhysics';

const DT = 1 / 240;
function simulate(c: Chip, seconds: number, onStep?: (c: Chip, t: number) => void): number {
  let t = 0;
  while (t < seconds && !c.rest) { stepChip(c, DT); t += DT; onStep?.(c, t); }
  return t;
}
const from = seatPosition(0, 5), to = CENTER;

describe('chip sliding physics (top view, no bounce)', () => {
  it('slides in a straight line and stops exactly on the target after T seconds', () => {
    const c = launchChip(from, to, 0.7, 0, 25);
    const t = simulate(c, 3);
    expect(c.rest).toBe(true);
    expect(t).toBeGreaterThan(0.68); expect(t).toBeLessThan(0.73);
    expect([c.x, c.y]).toEqual([to.x, to.y]);
  });
  it('never leaves the line between start and target and never overshoots', () => {
    const c = launchChip(from, to, 0.7, 0, 25);
    const total = Math.hypot(to.x - from.x, to.y - from.y);
    let prevDist = total + 1;
    simulate(c, 3, (ch) => {
      const cross = (ch.x - from.x) * (to.y - from.y) - (ch.y - from.y) * (to.x - from.x);
      expect(Math.abs(cross) / total).toBeLessThan(1e-6);
      const dist = Math.hypot(to.x - ch.x, to.y - ch.y);
      expect(dist).toBeLessThanOrEqual(prevDist + 1e-9);   // always getting closer: it does not bounce back or overshoot
      prevDist = dist;
    });
  });
  it('friction: speed only ever decreases, starting fast and ending at zero', () => {
    const c = launchChip(from, to, 0.7, 0, 5);
    const start = c.speed;
    let prev = start;
    simulate(c, 3, (ch) => { expect(ch.speed).toBeLessThanOrEqual(prev + 1e-9); prev = ch.speed; });
    expect(start).toBeGreaterThan(50);
    expect(c.speed).toBe(0);
  });
  it('has no vertical motion: chips are flat discs on the table', () => {
    const c = launchChip(from, to, 0.7, 0, 5) as unknown as Record<string, unknown>;
    expect('z' in c || 'vz' in c || 'bounces' in c).toBe(false);
  });
  it('waits for its delay before moving; a zero-distance chip is already at rest', () => {
    const c = launchChip(from, to, 0.5, 0.2, 25);
    for (let i = 0; i < 40; i++) stepChip(c, DT);          // 0.166 s: still waiting
    expect([c.x, c.y, c.age]).toEqual([from.x, from.y, 0]);
    expect(simulate(c, 3)).toBeLessThan(0.6);
    expect(launchChip(to, to, 0.5, 0, 1).rest).toBe(true);
  });
  it('is stable for different time steps', () => {
    const a = launchChip(from, to, 0.7, 0, 5), b = launchChip(from, to, 0.7, 0, 5);
    for (let i = 0; i < 80; i++) stepChip(a, 1 / 240);
    for (let i = 0; i < 320; i++) stepChip(b, 1 / 960);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.05); expect(Math.abs(a.y - b.y)).toBeLessThan(0.05);
  });
  it('throws a sensible set of chips for an amount', () => {
    expect(chipSet(0)).toEqual([1]);
    expect(chipSet(130)).toEqual([100, 25, 5]);
    for (const a of [1, 7, 25, 999, 4321, 1_000_000]) { expect(chipSet(a).length).toBeGreaterThan(0); expect(chipSet(a).length).toBeLessThanOrEqual(10); }
  });
});

describe('bet flights', () => {
  it('throws chips from the seat to its bet spot only when that bet grows in the same hand', () => {
    const prev = { hand: 3, bets: [0, 20, 0] };
    const r = planBetFlights(prev, { hand: 3, bets: [60, 20, 40] }, 1);
    expect(r.map((f) => f.amount)).toEqual([60, 40]);
    expect(r[0]!.from).toEqual(seatPosition(0, 3)); expect(r[0]!.to).toEqual(betPosition(0, 3));
    expect(planBetFlights(prev, { hand: 3, bets: [0, 0, 0] }, 1)).toEqual([]);
    expect(planBetFlights(prev, { hand: 4, bets: [10, 20, 0] }, 1)).toEqual([]);
    expect(planBetFlights(null, { hand: 1, bets: [5] }, 1)).toEqual([]);
    expect(planBetFlights(prev, { hand: 3, bets: [60, 20, 40] }, 0)).toEqual([]);
  });
});
