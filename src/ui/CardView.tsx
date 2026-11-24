import { useEffect, useState, type CSSProperties } from 'react';
import type { Card } from '../engine/types';
import { PixelText } from './pixel/PixelText';
import { SuitSprite } from './pixel/Sprites';

const SUIT_NAME: Record<Card['suit'], string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r: number): string => RANK[r] ?? String(r);

interface Props {
  card?: Card; hidden?: boolean; dim?: boolean; lit?: boolean; small?: boolean; hero?: boolean;
  /** Deal animation: offset (in cqw) from the deck and stagger index. */
  deal?: { dx: number; dy: number; i: number };
}

/** Pixel-art card. The suit is drawn as a shape AND colored, so it never depends on color alone. */
export function CardView({ card, hidden = false, dim = false, lit = false, small = false, hero = false, deal }: Props) {
  const cls = `card${small ? ' small' : ''}${hero ? ' hero' : ''}${dim ? ' dim' : ''}${lit ? ' lit' : ''}${deal ? ' deal' : ''}`;
  const style = deal ? ({ '--dx': deal.dx, '--dy': deal.dy, '--i': deal.i } as CSSProperties) : undefined;
  if (!card || hidden) return <div className={`${cls} back`} style={style} aria-label="face-down card" />;
  const red = card.suit === 'h' || card.suit === 'd';
  return (
    <div className={`${cls} ${red ? 'red' : 'black'}`} style={style} aria-label={`${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}`}>
      <PixelText text={rankLabel(card.rank)} scale={small ? 3 : 4} className="rank" />
      <SuitSprite suit={card.suit} scale={small ? 3 : 4} className="suit" />
      <span className="big"><SuitSprite suit={card.suit} scale={small ? 4 : 6} className="bigsuit" /></span>
    </div>
  );
}

/** Board card that turns over step by step; the face appears halfway through the flip. */
export function FlipCard({ card, delayMs, factor, lit, dim }: { card: Card; delayMs: number; factor: number; lit: boolean; dim: boolean }) {
  const [revealed, setRevealed] = useState(factor === 0);
  useEffect(() => {
    if (factor === 0) { setRevealed(true); return; }
    const id = window.setTimeout(() => setRevealed(true), (delayMs + 150) * factor);
    return () => window.clearTimeout(id);
  }, [factor, delayMs]);
  return (
    <div className="flipwrap" style={{ '--d': `${Math.round(delayMs * factor)}ms` } as CSSProperties}>
      <CardView card={card} hidden={!revealed} lit={lit} dim={dim} />
    </div>
  );
}
