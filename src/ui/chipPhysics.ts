import type { Pt } from './anim';
import { chipBreakdown } from './pixel/data';

/** A chip seen from above, sliding across the felt. Positions are % of the felt. */
export interface Chip {
  x: number; y: number; tx: number; ty: number;
  dirX: number; dirY: number; speed: number; decel: number;
  denom: number; delay: number; age: number; rest: boolean; restAge: number;
}

/**
 * Pushes a chip so that it slides over the felt under constant friction (constant deceleration)
 * and comes to a stop exactly on `to` after `T` seconds: start speed 2D/T, deceleration 2D/T^2. No bouncing.
 */
export function launchChip(from: Pt, to: Pt, T: number, delay: number, denom: number): Chip {
  const dx = to.x - from.x, dy = to.y - from.y, D = Math.hypot(dx, dy);
  const base = { x: from.x, y: from.y, tx: to.x, ty: to.y, denom, delay, age: 0, restAge: 0 };
  if (D < 1e-6) return { ...base, dirX: 0, dirY: 0, speed: 0, decel: 0, rest: true };
  return { ...base, dirX: dx / D, dirY: dy / D, speed: (2 * D) / T, decel: (2 * D) / (T * T), rest: false };
}

/** One physics step (mutates): the chip slows down with friction and stops at its target. */
export function stepChip(c: Chip, dt: number): void {
  if (c.rest) { c.restAge += dt; return; }
  if (c.delay > 0) { c.delay -= dt; return; }
  c.age += dt;
  const next = c.speed - c.decel * dt;
  if (next <= 0) { c.x = c.tx; c.y = c.ty; c.speed = 0; c.rest = true; return; }
  const travelled = ((c.speed + next) / 2) * dt;
  c.x += c.dirX * travelled; c.y += c.dirY * travelled;
  c.speed = next;
}

/** Denominations of the chips to throw for an amount: a handful of chips, biggest value first. */
export function chipSet(amount: number, max = 10): number[] {
  const out: number[] = [];
  for (const { denom, count } of chipBreakdown(amount)) for (let i = 0; i < Math.min(count, 4) && out.length < max; i++) out.push(denom);
  return out.length > 0 ? out : [1];
}
