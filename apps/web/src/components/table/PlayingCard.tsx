import { type Card, RANKS, rankOf, suitOf } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { usePlay } from '../../lib/store';

const SUIT_GLYPH = ['♣', '♦', '♥', '♠'];
/** Card fills by suit (clubs, diamonds, hearts, spades). White text clears 4.5:1 on each. */
const FOUR_COLOR = ['#2f7350', '#2f62a8', '#b83b32', '#464c55'];
const TWO_COLOR = ['#464c55', '#b83b32', '#b83b32', '#464c55'];

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const DIMS: Record<CardSize, { w: number; h: number; rank: number; suit: number; corner: number }> = {
  xs: { w: 30, h: 42, rank: 15, suit: 10, corner: 3 },
  sm: { w: 44, h: 62, rank: 22, suit: 13, corner: 4 },
  md: { w: 62, h: 88, rank: 32, suit: 17, corner: 5 },
  lg: { w: 74, h: 104, rank: 40, suit: 20, corner: 6 },
};

export function rankLabel(c: Card) {
  const r = RANKS[rankOf(c)];
  return r === 'T' ? '10' : r;
}

const SUIT_NAME = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANK_NAME: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' };

export function cardName(c: Card) {
  const r = RANKS[rankOf(c)];
  return `${RANK_NAME[r] ?? r} of ${SUIT_NAME[suitOf(c)]}`;
}

export function useSuitFill() {
  const fourColor = usePlay((s) => s.settings.fourColor);
  return (c: Card) => (fourColor ? FOUR_COLOR : TWO_COLOR)[suitOf(c)];
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

/**
 * A minimal card: a solid suit-coloured face with one large rank and its suit
 * underneath. Flips in 3D between the hatched back and the face.
 */
export function PlayingCard({ card, faceUp = true, size = 'md', highlight, dim, delay = 0, from, className = '' }: Props) {
  const fill = useSuitFill();
  const d = DIMS[size];
  const showFace = faceUp && card !== undefined;
  return (
    <motion.div
      className={`card-3d relative shrink-0 ${className}`}
      style={{ width: d.w, height: d.h }}
      role="img"
      aria-label={showFace ? cardName(card) : 'Face-down card'}
      initial={from ? { x: from.x, y: from.y, opacity: 0, scale: 0.9 } : { y: -10, opacity: 0, scale: 0.94 }}
      animate={{ x: 0, y: 0, opacity: dim ? 0.32 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay }}
    >
      <div className="card-inner absolute inset-0" style={{ transform: showFace ? 'rotateY(0deg)' : 'rotateY(180deg)', transitionDelay: `${delay}s` }}>
        <div
          className="card-face absolute inset-0 flex flex-col items-center justify-center text-white"
          style={{
            borderRadius: d.corner,
            background: card !== undefined ? fill(card) : 'transparent',
            boxShadow: highlight
              ? 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 0 0 2px var(--color-ink-950), 0 0 0 3.5px var(--color-gold)'
              : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            gap: size === 'xs' ? 0 : d.h * 0.04,
          }}
        >
          {card !== undefined && (
            <>
              <span className="font-sans font-bold leading-none" style={{ fontSize: d.rank, letterSpacing: '-0.03em' }}>
                {rankLabel(card)}
              </span>
              <span className="leading-none" style={{ fontSize: d.suit }} aria-hidden="true">
                {SUIT_GLYPH[suitOf(card)]}
              </span>
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
  const fill = useSuitFill();
  return (
    <span
      className="inline-flex items-center justify-center gap-[1px] rounded-[2px] px-[4px] font-mono text-[11px] font-bold leading-[17px] text-white"
      style={{ background: fill(card), minWidth: 24 }}
      title={cardName(card)}
    >
      {RANKS[rankOf(card)]}
      <span aria-hidden="true">{SUIT_GLYPH[suitOf(card)]}</span>
    </span>
  );
}
