import { type Card, RANKS, rankOf, suitOf } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { usePlay } from '../../lib/store';

const SUIT_GLYPH = ['♣', '♦', '♥', '♠'];
const TWO_COLOR = ['#111827', '#dc2626', '#dc2626', '#111827'];
const FOUR_COLOR = ['#15803d', '#2563eb', '#dc2626', '#111827'];

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const DIMS: Record<CardSize, { w: number; h: number; rank: number; pip: number; corner: number }> = {
  xs: { w: 30, h: 42, rank: 13, pip: 11, corner: 4 },
  sm: { w: 44, h: 62, rank: 17, pip: 15, corner: 6 },
  md: { w: 62, h: 88, rank: 24, pip: 30, corner: 8 },
  lg: { w: 78, h: 110, rank: 30, pip: 40, corner: 10 },
};

export function rankLabel(c: Card) {
  const r = RANKS[rankOf(c)];
  return r === 'T' ? '10' : r;
}

interface Props {
  card?: Card;
  faceUp?: boolean;
  size?: CardSize;
  highlight?: boolean;
  dim?: boolean;
  delay?: number;
  from?: { x: number; y: number };
  className?: string;
}

/** A playing card with a 3D flip between back and face. */
export function PlayingCard({ card, faceUp = true, size = 'md', highlight, dim, delay = 0, from, className = '' }: Props) {
  const fourColor = usePlay((s) => s.settings.fourColor);
  const d = DIMS[size];
  const showFace = faceUp && card !== undefined;
  const color = card !== undefined ? (fourColor ? FOUR_COLOR : TWO_COLOR)[suitOf(card)] : '#000';
  return (
    <motion.div
      className={`card-3d relative shrink-0 ${className}`}
      style={{ width: d.w, height: d.h }}
      initial={from ? { x: from.x, y: from.y, opacity: 0, rotate: -8, scale: 0.85 } : { y: -12, opacity: 0, scale: 0.9 }}
      animate={{ x: 0, y: 0, opacity: dim ? 0.38 : 1, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay }}
    >
      <div
        className="card-inner absolute inset-0"
        style={{ transform: showFace ? 'rotateY(0deg)' : 'rotateY(180deg)', transitionDelay: `${delay}s` }}
      >
        <div
          className="card-face absolute inset-0 overflow-hidden"
          style={{
            borderRadius: d.corner,
            outline: highlight ? '2px solid var(--color-gold)' : undefined,
            boxShadow: highlight ? '0 0 22px rgba(251,191,36,0.65), 0 10px 25px -8px rgba(0,0,0,0.6)' : undefined,
          }}
        >
          {card !== undefined && (
            <>
              <div
                className="absolute left-[8%] top-[4%] flex flex-col items-center leading-none font-bold"
                style={{ color, fontSize: d.rank, fontFamily: 'var(--font-display)', letterSpacing: '-0.04em' }}
              >
                <span>{rankLabel(card)}</span>
                <span style={{ fontSize: d.rank * 0.78, marginTop: 1 }}>{SUIT_GLYPH[suitOf(card)]}</span>
              </div>
              {size !== 'xs' && (
                <div
                  className="absolute bottom-[6%] right-[8%] leading-none"
                  style={{ color, fontSize: d.pip, opacity: 0.92 }}
                >
                  {SUIT_GLYPH[suitOf(card)]}
                </div>
              )}
            </>
          )}
        </div>
        <div className="card-back card-back-pattern absolute inset-0" style={{ borderRadius: d.corner }} />
      </div>
    </motion.div>
  );
}

/** Small inline card chip for text (history, tooltips). */
export function MiniCard({ card }: { card: Card }) {
  const fourColor = usePlay((s) => s.settings.fourColor);
  const color = (fourColor ? FOUR_COLOR : TWO_COLOR)[suitOf(card)];
  return (
    <span
      className="inline-flex items-center justify-center rounded-[4px] bg-white px-[3px] font-mono text-[11px] font-bold leading-[16px] shadow-sm"
      style={{ color, minWidth: 22 }}
    >
      {RANKS[rankOf(card)]}
      {SUIT_GLYPH[suitOf(card)]}
    </span>
  );
}
