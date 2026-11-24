import { useMemo } from 'react';
import type { Suit } from '../../engine/types';
import { CHIP_GRID, CHIP_H, CHIP_W, SUIT_BITMAPS, avatarColors, avatarGrid, chipBreakdown, chipColor, gridPaths } from './data';

export function SuitSprite({ suit, scale = 2, className = '' }: { suit: Suit; scale?: number; className?: string }) {
  const d = useMemo(() => gridPaths(SUIT_BITMAPS[suit])['#'] ?? '', [suit]);
  return <svg className={`px ${className}`} width={9 * scale} height={9 * scale} viewBox="0 0 9 9" shapeRendering="crispEdges" fill="currentColor" aria-hidden><path d={d} /></svg>;
}

export function Avatar({ index, scale = 4 }: { index: number; scale?: number }) {
  const paths = useMemo(() => gridPaths(avatarGrid(index)), [index]);
  const colors = avatarColors(index);
  return (
    <svg className="px avatar" width={8 * scale} height={8 * scale} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {Object.entries(paths).map(([ch, d]) => <path key={ch} d={d} fill={colors[ch] ?? '#f0f'} />)}
    </svg>
  );
}

const CHIP_PATHS = gridPaths(CHIP_GRID);
const LAYER = 3;  // vertical offset between chips of a stack
const GAP = 2;

/** Stacks of chips (top view with visible edge): one stack per denomination (up to two), up to five chips high. */
export function ChipStack({ amount, scale = 2 }: { amount: number; scale?: number }) {
  const groups = chipBreakdown(amount).slice(0, 2);
  const heights = groups.map((g) => Math.min(5, g.count));
  const maxN = Math.max(1, ...heights);
  const W = Math.max(1, groups.length) * (CHIP_W + GAP) - GAP, H = CHIP_H + (maxN - 1) * LAYER;
  return (
    <svg className="px" width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden>
      {groups.map((g, gi) => Array.from({ length: heights[gi]! }, (_, i) => (
        <g key={`${gi}-${i}`} transform={`translate(${gi * (CHIP_W + GAP)} ${(maxN - 1) * LAYER - i * LAYER})`}>
          {Object.entries(CHIP_PATHS).map(([ch, d]) => <path key={ch} d={d} fill={chipColor(g.denom, ch)} />)}
        </g>
      )))}
    </svg>
  );
}
