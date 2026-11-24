import { useMemo } from 'react';
import { textPath } from './font';

/** Text drawn from the in-code bitmap font. `scale` = screen pixels per font pixel. */
export function PixelText({ text, scale = 2, className = '' }: { text: string | number; scale?: number; className?: string }) {
  const label = String(text);
  const t = [...label.toUpperCase()].join(''); // width must match the characters actually drawn
  const d = useMemo(() => textPath(t), [t]);
  const w = Math.max(1, [...t].length * 6 - 1);
  return (
    <svg className={`px ${className}`} role="img" aria-label={label} width={w * scale} height={7 * scale}
      viewBox={`0 0 ${w} 7`} shapeRendering="crispEdges" fill="currentColor"><path d={d} /></svg>
  );
}
