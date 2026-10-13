import { type Card, type HUNLState } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { bb } from '../../lib/format';
import { bestFive } from '../../lib/hands';
import { BOT, HUMAN, usePlay } from '../../lib/store';
import { FitBox } from '../ui/FitBox';
import { BetChips, ChipStack } from './Chips';
import { NashSeat } from './Nash';
import { PlayingCard } from './PlayingCard';

function useViewport() {
  const read = () => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1440, h: typeof window !== 'undefined' ? window.innerHeight : 900 });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/**
 * The table drawn as a technical sketch: a chalk outline with a dashed
 * construction line, Nash's seat above and yours below.
 */
export function Table() {
  const state = usePlay((s) => s.state);
  usePlay((s) => s.version);
  const phase = usePlay((s) => s.phase);
  const showBotCards = usePlay((s) => s.settings.showBotCards);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);

  const vp = useViewport();
  const narrow = vp.w < 720;
  // On desktop, keep the whole play area inside one screen.
  const maxHeight = vp.w >= 1024 ? Math.max(380, vp.h - 330) : undefined;
  const W = narrow ? 560 : 960;
  const H = narrow ? 580 : 600;
  const potTop = narrow ? 200 : 196;
  const potLine = narrow ? 300 : 360;
  // where the pot's chips sit: just left of the pot dimension line
  const potX = W / 2 - potLine / 2 - 36;
  const potY = potTop - 8;
  const betX = W / 2 + (narrow ? 70 : 80);
  const betTop = narrow ? 120 : 112;

  const gutter = narrow ? 6 : 40;
  const over = phase === 'over' && state?.terminal;
  const settled = !!over && last?.id === handNo;
  const winner = settled ? last!.winner : null;
  const showdown = !!(over && state?.isShowdown);
  const winners: Card[] = showdown && state ? winningCards(state) : [];
  const cardSize = narrow ? 'md' : 'lg';

  return (
    <FitBox width={W} height={H} maxHeight={maxHeight}>
      <div className="relative" style={{ width: W, height: H }}>
        {/* the drawn table */}
        <div className="table-guide pointer-events-none absolute rounded-[999px]" style={{ left: gutter - 10, right: gutter - 10, top: 58, bottom: 58 }} />
        <div className="table-outline absolute rounded-[999px]" style={{ left: gutter, right: gutter, top: 68, bottom: 68 }} />

        {state && (
          <>
            {/* pot as a dimension line */}
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[12px]" style={{ top: potTop, width: potLine }}>
              <span aria-hidden="true" className="text-[8px]">◀</span>
              <span className="h-px flex-1 bg-ink-100" />
              <span className="tabular font-bold tracking-[0.08em]">POT {bb(state.pot)}</span>
              <span className="h-px flex-1 bg-ink-100" />
              <span aria-hidden="true" className="text-[8px]">▶</span>
            </div>

            {/* board */}
            <div className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2" style={{ top: H / 2 + (narrow ? 0 : 6), gap: narrow ? 6 : 10 }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const c = state.board[i];
                return c !== undefined ? (
                  <PlayingCard
                    key={`${handNo}-b${i}`}
                    card={c}
                    size={cardSize}
                    delay={i < 3 ? i * 0.08 : 0}
                    highlight={winners.includes(c)}
                    dim={showdown && winners.length > 0 && !winners.includes(c)}
                  />
                ) : (
                  <div
                    key={`slot${i}`}
                    className="border border-dashed border-ink-500"
                    style={narrow ? { width: 62, height: 88, borderRadius: 5 } : { width: 74, height: 104, borderRadius: 6 }}
                  />
                );
              })}
            </div>

            {/* chips already in the pot; slide to the winner when the hand settles */}
            <AnimatePresence>
              {potInMiddle(state) > 0 && (
                <motion.div
                  key={`pot-${handNo}`}
                  className="absolute"
                  style={{ left: potX, top: potY }}
                  initial={{ opacity: 0 }}
                  animate={
                    winner === 'human'
                      ? { x: W / 2 - potX - 12, y: H - 30 - potY, opacity: 0, transition: { delay: 0.5, duration: 0.6, ease: 'easeIn' } }
                      : winner === 'bot'
                        ? { x: W / 2 - potX - 12, y: 30 - potY, opacity: 0, transition: { delay: 0.5, duration: 0.6, ease: 'easeIn' } }
                        : { x: 0, y: 0, opacity: 1 }
                  }
                  exit={{ opacity: 0 }}
                >
                  <ChipStack amount={potInMiddle(state)} size={20} label={false} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* street bets; at the end of a street they slide into the pot */}
            <div className="absolute" style={{ left: betX, top: betTop }}>
              <BetChips amount={state.terminal ? 0 : state.streetBet[BOT]} id={`bb-${handNo}-${state.street}`} color="var(--color-gold)" exitTo={{ x: potX - betX, y: potY - betTop }} />
            </div>
            <div className="absolute" style={{ left: betX, bottom: betTop }}>
              <BetChips amount={state.terminal ? 0 : state.streetBet[HUMAN]} id={`hb-${handNo}-${state.street}`} exitTo={{ x: potX - betX, y: potY - (H - betTop - 24) }} />
            </div>
          </>
        )}

        {!state && <IdleTable />}

        {/* hole cards */}
        <HoleCards seat={BOT} state={state} faceUp={showdown || (showBotCards && !!state)} winners={winners} top={narrow ? 92 : 86} size={narrow ? 'sm' : 'md'} />
        <HoleCards seat={HUMAN} state={state} faceUp={!!state} winners={winners} bottom={narrow ? 92 : 86} size={cardSize === 'lg' ? 'md' : 'md'} />

        {/* player bars */}
        <NashSeat
          state={state}
          stack={settled ? 10_000 - last!.net : state ? state.stacks[BOT] : 10_000}
          toAct={!!state && !state.terminal && state.toAct === BOT}
          width={narrow ? 250 : 340}
          left={narrow ? 16 : undefined}
        />
        <SeatBar seat={HUMAN} state={state} narrow={narrow} />
      </div>
    </FitBox>
  );
}

function potInMiddle(s: HUNLState) {
  return s.terminal ? s.pot : s.pot - s.streetBet[0] - s.streetBet[1];
}

function winningCards(s: HUNLState): Card[] {
  const w = s.winner();
  if (w < 0) return [];
  return bestFive(s.holes(w), s.deal.board);
}

function HoleCards({
  seat,
  state,
  faceUp,
  winners,
  top,
  bottom,
  size,
}: {
  seat: number;
  state: HUNLState | null;
  faceUp: boolean;
  winners: Card[];
  top?: number;
  bottom?: number;
  size: 'sm' | 'md';
}) {
  const handNo = usePlay((s) => s.handNo);
  const phase = usePlay((s) => s.phase);
  const holes = state?.holes(seat);
  if (!holes) return null;
  const folded = state?.folded === seat;
  const showdown = phase === 'over' && state?.isShowdown;
  const isHuman = seat === HUMAN;
  const myTurn = isHuman && phase === 'human';
  return (
    <div className="absolute left-1/2 flex -translate-x-1/2 gap-2" style={{ top, bottom }}>
      {holes.map((c, i) => (
        <PlayingCard
          key={`${handNo}-${seat}-${i}`}
          card={c}
          faceUp={faceUp}
          size={size}
          from={{ x: 0, y: top !== undefined ? -60 : 60 }}
          delay={i * 0.1 + (isHuman ? 0 : 0.05)}
          highlight={(!!showdown && winners.includes(c)) || (myTurn && !showdown)}
          dim={folded}
        />
      ))}
    </div>
  );
}

function SeatBar({ seat, state, narrow }: { seat: number; state: HUNLState | null; narrow: boolean }) {
  const isBot = seat === BOT;
  const phase = usePlay((s) => s.phase);
  const lambda = usePlay((s) => s.settings.lambda);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);
  // Once the hand is settled, show stacks after the pot is paid out (each hand starts at 100 bb).
  const settled = !!state?.terminal && last?.id === handNo;
  const stack = settled ? 10_000 + (isBot ? -last.net : last.net) : state ? state.stacks[seat] : 10_000;
  const toAct = !!state && !state.terminal && state.toAct === seat;
  const isButton = state?.button === seat;
  const allIn = !!state && state.stacks[seat] === 0 && !state.terminal;
  const thinking = isBot && phase === 'bot';
  return (
    <div
      className={`absolute left-1/2 flex -translate-x-1/2 items-stretch border bg-ink-900 ${toAct ? 'border-ink-100' : 'border-ink-600'}`}
      style={{ width: narrow ? 360 : 340, height: 46, ...(isBot ? { top: 4 } : { bottom: 4 }) }}
    >
      <span className={`grid w-11 place-items-center border-r font-mono text-[11px] font-bold ${toAct ? 'border-ink-100' : 'border-ink-600'}`} aria-hidden="true">
        {isBot ? 'RL' : 'YOU'}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <strong className="truncate font-bold">{isBot ? 'Poker RL' : 'You'}</strong>
        {isButton && <span className="font-mono text-[10px] tracking-[0.08em] text-ink-400" title="Dealer button">D</span>}
        {isBot && <span className="font-mono text-[10px] tracking-[0.08em] text-ink-400">{lambda > 0 ? 'ADAPTIVE' : 'BALANCED'}</span>}
        {thinking && <span className="thinking-shimmer ml-auto h-[2px] w-10" aria-label="Thinking" />}
      </span>
      <span
        className={`tabular flex min-w-[88px] items-center justify-end px-3 font-mono text-[19px] font-bold ${
          toAct && !isBot ? 'bg-ink-100 text-ink-950' : 'border-l border-ink-600 text-ink-300'
        }`}
      >
        {allIn ? 'ALL-IN' : bb(stack, stack % 100 === 0 ? 0 : 1)}
      </span>
    </div>
  );
}

function IdleTable() {
  const newHand = usePlay((s) => s.newHand);
  const phase = usePlay((s) => s.phase);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div className="flex gap-2.5">
        {[51, 46, 41, 36, 31].map((c, i) => (
          <PlayingCard key={c} card={c} size="lg" delay={0.15 + i * 0.07} />
        ))}
      </div>
      <button onClick={newHand} disabled={phase === 'loading'} className="btn btn-gold min-h-[52px] px-10 text-base">
        Deal
      </button>
    </div>
  );
}

/** Small bot mark used in the AI panel: a square with a pulse while it thinks. */
export function BotAvatar({ thinking, size = 44 }: { thinking: boolean; size?: number }) {
  return (
    <div className="relative grid shrink-0 place-items-center border border-ink-500 font-mono text-[11px] font-bold" style={{ width: size, height: size }} aria-hidden="true">
      RL
      {thinking && <span className="thinking-shimmer absolute inset-x-0 bottom-0 h-[2px]" />}
    </div>
  );
}
