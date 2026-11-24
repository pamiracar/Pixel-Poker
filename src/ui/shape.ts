/**
 * Polygon points (CSS clip-path, px) of a rounded rectangle drawn with pixel steps:
 * corners are elliptical arcs quantized to `step`, so the outline looks like pixel art.
 */
export function pixelRoundRect(w: number, h: number, rx: number, ry: number, step: number): [number, number][] {
  const inset = (x: number): number => {
    const t = x < rx ? (rx - x) / rx : x > w - rx ? (x - (w - rx)) / rx : 0;
    const dy = t === 0 ? 0 : ry - ry * Math.sqrt(Math.max(0, 1 - t * t));
    return Math.round(dy / step) * step;
  };
  const top: [number, number][] = [];
  for (let x = 0; x < w; x += step) {
    const y = inset(Math.min(w, x + step / 2));
    top.push([x, y], [Math.min(w, x + step), y]);
  }
  const bottom = top.map(([x, y]) => [x, h - y] as [number, number]).reverse();
  return [...top, ...bottom];
}
export const polygonCss = (pts: [number, number][]): string => `polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(',')})`;
