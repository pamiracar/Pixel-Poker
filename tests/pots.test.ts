import { describe, expect, it } from 'vitest';
import { buildPots, distributePots } from '../src/engine/pots';

const c = (id: number, amount: number, folded = false) => ({ id, amount, folded });

describe('buildPots', () => {
  it('single pot when contributions are equal', () => {
    expect(buildPots([c(0, 100), c(1, 100), c(2, 100)])).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
  });
  it('main + one side pot', () => {
    expect(buildPots([c(0, 50), c(1, 200), c(2, 200)])).toEqual([
      { amount: 150, eligible: [0, 1, 2] }, { amount: 300, eligible: [1, 2] }]);
  });
  it('multiple side pots with three different all-in sizes', () => {
    const pots = buildPots([c(0, 100), c(1, 300), c(2, 600), c(3, 600)]);
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 1, 2, 3] }, { amount: 600, eligible: [1, 2, 3] }, { amount: 600, eligible: [2, 3] }]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(1600);
  });
  it('folded chips are dead money, folded player is never eligible', () => {
    const pots = buildPots([c(0, 50), c(1, 200), c(2, 200), c(3, 120, true)]);
    expect(pots[0]).toEqual({ amount: 200, eligible: [0, 1, 2] });
    expect(pots[1]).toEqual({ amount: 370, eligible: [1, 2] });
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(570);
  });
});

describe('distributePots', () => {
  it('different winners per pot', () => {
    const pots = buildPots([c(0, 100), c(1, 300), c(2, 300)]);
    const { payouts } = distributePots(pots, new Map([[0, 9], [1, 5], [2, 1]]), [1, 2, 0]);
    expect(payouts.get(0)).toBe(300);
    expect(payouts.get(1)).toBe(400);
    expect(payouts.get(2)).toBeUndefined();
  });
  it('odd chip goes to the first winner left of the dealer', () => {
    const { payouts } = distributePots([{ amount: 101, eligible: [1, 2] }], new Map([[1, 7], [2, 7]]), [2, 0, 1]);
    expect(payouts.get(2)).toBe(51);
    expect(payouts.get(1)).toBe(50);
  });
  it('a short-stack winner only wins the pots it is eligible for', () => {
    const pots = buildPots([c(0, 50), c(1, 200), c(2, 200)]);
    const { payouts } = distributePots(pots, new Map([[0, 9], [1, 5], [2, 4]]), [1, 2, 0]);
    expect(payouts.get(0)).toBe(150);
    expect(payouts.get(1)).toBe(300);
  });
  it('three-way split with remainder 2 gives the extra chips to the first two in order', () => {
    const { payouts } = distributePots([{ amount: 302, eligible: [0, 1, 2] }], new Map([[0, 1], [1, 1], [2, 1]]), [1, 2, 0]);
    expect([payouts.get(1), payouts.get(2), payouts.get(0)]).toEqual([101, 101, 100]);
  });
});
