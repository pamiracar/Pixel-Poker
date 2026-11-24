import { useEffect, useRef } from 'react';
import type { Flight } from './anim';
import { CHIP_GRID, CHIP_H, CHIP_W, chipColor } from './pixel/data';
import { chipSet, launchChip, stepChip, type Chip } from './chipPhysics';

const P = 2; // one chip pixel = 2 stage pixels

/** Canvas overlay: pixel chips slide across the felt for every flight (bets, pot gathering, payouts). `speed`: 1 normal, <1 faster. */
export function ChipLayer({ flights, speed }: { flights: Flight[]; speed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chips = useRef<Chip[]>([]);
  const seen = useRef(new Set<number>());
  const raf = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const T = 0.35 + 0.25 * speed;
    for (const f of flights) {
      if (seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      chipSet(f.amount).forEach((denom, i) => chips.current.push(launchChip(f.from, f.to, T, (f.delayMs + i * 30) / 1000, denom)));
    }
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last.current) / 1000 || 0.016);
      last.current = now;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      ctx.clearRect(0, 0, W, H);
      for (const c of chips.current) {
        stepChip(c, dt);
        if (c.delay > 0) continue;
        const px = Math.round((c.x / 100) * W - (CHIP_W * P) / 2), py = Math.round((c.y / 100) * H - (CHIP_H * P) / 2);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(px + 2 * P, py + 12 * P, (CHIP_W - 4) * P, 4 * P);               // soft shadow on the felt
        CHIP_GRID.forEach((row, gy) => [...row].forEach((ch, gx) => {
          if (ch === '.') return;
          ctx.fillStyle = chipColor(c.denom, ch);
          ctx.fillRect(px + gx * P, py + gy * P, P, P);
        }));
      }
      chips.current = chips.current.filter((c) => !c.rest);   // landed chips merge into the pile shown by the table
      raf.current = chips.current.length > 0 ? requestAnimationFrame(frame) : 0;
      if (chips.current.length === 0) ctx.clearRect(0, 0, W, H);
    };
    if (!raf.current && chips.current.length > 0) { last.current = performance.now(); raf.current = requestAnimationFrame(frame); }
  }, [flights, speed]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  return <canvas ref={ref} className="chip-layer" aria-hidden />;
}
