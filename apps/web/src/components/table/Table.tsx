import { type Card, type HUNLState } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { money } from '../../lib/format';
import { autosize } from '../../lib/embed';
import { bestFive } from '../../lib/hands';
import { BOT, HUMAN, usePlay } from '../../lib/store';
import { FitBox } from '../ui/FitBox';
import { BetChips, ChipStack } from './Chips';
import { OttoSeat } from './Otto';
import { DIMS, Deck, PlayingCard } from './PlayingCard';
import { Count } from '../ui/Count';

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
 * construction line, Otto's seat above and yours below. Cards are dealt from
 * the deck on the left; bets slide out from the seats, into the pot at the end
 * of each street, and to the winner at the end of the hand.
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
  // On desktop, keep the whole play area inside one screen. In a self-sizing
  // embed the frame grows to fit the content, so only the width limits the table.
  const maxHeight = vp.w >= 1024 && !autosize ? Math.max(380, vp.h - 300) : undefined;
  const W = narrow ? 560 : 960;
  const H = narrow ? 580 : 600;
  const potTop = narrow ? 200 : 196;
  const potLine = narrow ? 300 : 360;
  // where the pot's chips sit: just left of the pot dimension line
  const potX = W / 2 - potLine / 2 - 36;
  const potY = potTop - 8;
  const betX = W / 2 + (narrow ? 70 : 80);
  const betTop = narrow ? 120 : 112;
  const seatY = { bot: 30, human: H - 30 };

  const gutter = narrow ? 6 : 40;
  const over = phase === 'over' && state?.terminal;
  const settled = !!over && last?.id === handNo;
  const winner = settled ? last!.winner : null;
  const showdown = !!(over && state?.isShowdown);
  const winners: Card[] = showdown && state ? winningCards(state) : [];
  const cardSize = narrow ? 'md' : 'lg';
  const holeSize = narrow ? ('sm' as const) : ('md' as const);
  const boardY = H / 2 + (narrow ? 0 : 6);
  const deckSize = narrow ? ('sm' as const) : ('md' as const);
  const deckX = narrow ? 30 : gutter + 54;
  const deck = { x: deckX + DIMS[deckSize].w / 2, y: boardY };
  const cw = DIMS[cardSize].w;
  const gap = narrow ? 6 : 10;
  const botTop = narrow ? 92 : 86;
  const humanBottom = narrow ? 92 : 86;
  const holeCenter = (seat: number, i: number) => {
    const d = DIMS[seat === BOT ? holeSize : 'md'];
    return { x: W / 2 + (i - 0.5) * (d.w + 8), y: seat === BOT ? botTop + d.h / 2 : H - humanBottom - d.h / 2 };
  };
  const toWinner = winner === 'human' || winner === 'bot' ? { x: W / 2 - potX - 20, y: (winner === 'human' ? seatY.human : seatY.bot) - potY } : null;
  const buttonSeat = state?.button;

  return (
    <FitBox width={W} height={H} maxHeight={maxHeight}>
      <div className="relative" style={{ width: W, height: H }}>
        {/* the drawn table */}
        <div className="table-guide pointer-events-none absolute rounded-[999px]" style={{ left: gutter - 10, right: gutter - 10, top: 58, bottom: 58 }} />
        <div className="table-outline absolute rounded-[999px]" style={{ left: gutter, right: gutter, top: 68, bottom: 68 }} />

        {state && (
          <>
            <div className="absolute -translate-y-1/2" style={{ left: deckX, top: boardY }}>
              <Deck size={deckSize} />
            </div>

            {/* pot as a dimension line */}
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[12px]" style={{ top: potTop, width: potLine }}>
              <span aria-hidden="true" className="text-[8px]">◀</span>
              <span className="h-px flex-1 bg-ink-100" />
              <span className="tabular font-bold tracking-[0.08em]">
                POT <Count value={state.pot} format={money} duration={0.4} />
              </span>
              <span className="h-px flex-1 bg-ink-100" />
              <span aria-hidden="true" className="text-[8px]">▶</span>
            </div>

            {/* board */}
            <div className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2" style={{ top: boardY, gap }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const c = state.board[i];
                const fx = W / 2 + (i - 2) * (cw + gap);
                return c !== undefined ? (
                  <PlayingCard
                    key={`${handNo}-b${i}`}
                    card={c}
                    size={cardSize}
                    from={{ x: deck.x - fx, y: 0 }}
                    delay={i < 3 ? i * 0.09 : 0}
                    highlight={winners.includes(c)}
                    dim={showdown && winners.length > 0 && !winners.includes(c)}
                  />
                ) : (
                  <div
                    key={`slot${i}`}
                    className="border border-dashed border-ink-600"
                    style={narrow ? { width: 62, height: 88, borderRadius: 5 } : { width: 74, height: 104, borderRadius: 6 }}
                  />
                );
              })}
            </div>

            {/* chips already in the pot; they arc to the winner when the hand settles */}
            <AnimatePresence>
              {potInMiddle(state) > 0 && (
                <motion.div
                  key={`pot-${handNo}`}
                  className="absolute"
                  style={{ left: potX, top: potY }}
                  initial={{ opacity: 0 }}
                  animate={
                    toWinner
                      ? {
                          x: [0, toWinner.x * 0.55, toWinner.x],
                          y: [0, toWinner.y * 0.45 - 40, toWinner.y],
                          scale: [1, 1.05, 0.7],
                          opacity: [1, 1, 0],
                          transition: { delay: showdown ? 0.9 : 0.35, duration: 0.75, ease: 'easeInOut' },
                        }
                      : { x: 0, y: 0, opacity: 1 }
                  }
                  exit={{ opacity: 0 }}
                >
                  <ChipStack amount={potInMiddle(state)} size={20} label={false} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* street bets: out from the seat, into the pot when the street ends */}
            <div className="absolute" style={{ left: betX, top: betTop }}>
              <BetChips
                amount={state.terminal ? 0 : state.streetBet[BOT]}
                id={`bb-${handNo}-${state.street}`}
                color="var(--color-gold)"
                from={{ x: W / 2 - betX - 20, y: seatY.bot - betTop }}
                exitTo={{ x: potX - betX, y: potY - betTop }}
              />
            </div>
            <div className="absolute" style={{ left: betX, bottom: betTop }}>
              <BetChips
                amount={state.terminal ? 0 : state.streetBet[HUMAN]}
                id={`hb-${handNo}-${state.street}`}
                from={{ x: W / 2 - betX - 20, y: seatY.human - (H - betTop - 12) }}
                exitTo={{ x: potX - betX, y: potY - (H - betTop - 24) }}
              />
            </div>

            {/* dealer button, beside the button player's cards */}
            {buttonSeat !== undefined && (
              <motion.div
                className="absolute grid h-[24px] w-[24px] place-items-center rounded-full bg-ink-100 font-mono text-[11px] font-bold text-ink-950"
                style={{ left: W / 2 - 66 - 40 }}
                initial={false}
                animate={{ top: buttonSeat === BOT ? holeCenter(BOT, 0).y - 12 : holeCenter(HUMAN, 0).y - 12 }}
                transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                title="Dealer button"
              >
                D
              </motion.div>
            )}
          </>
        )}

        {!state && <IdleTable />}

        {/* hole cards */}
        <HoleCards
          seat={BOT}
          state={state}
          faceUp={showdown || (showBotCards && !!state)}
          winners={winners}
          top={botTop}
          size={holeSize}
          from={(i) => ({ x: deck.x - holeCenter(BOT, i).x, y: deck.y - holeCenter(BOT, i).y })}
        />
        <HoleCards
          seat={HUMAN}
          state={state}
          faceUp={!!state}
          winners={winners}
          bottom={humanBottom}
          size="md"
          from={(i) => ({ x: deck.x - holeCenter(HUMAN, i).x, y: deck.y - holeCenter(HUMAN, i).y })}
        />

        {/* player bars */}
        <OttoSeat
          state={state}
          stack={settled ? 10_000 - last!.net : state ? state.stacks[BOT] : 10_000}
          toAct={!!state && !state.terminal && state.toAct === BOT}
          won={winner === 'bot'}
          width={narrow ? 250 : 300}
          left={narrow ? 16 : undefined}
        />
        <SeatBar state={state} won={winner === 'human'} />
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
  from,
}: {
  seat: number;
  state: HUNLState | null;
  faceUp: boolean;
  winners: Card[];
  top?: number;
  bottom?: number;
  size: 'sm' | 'md';
  from: (i: number) => { x: number; y: number };
}) {
  const handNo = usePlay((s) => s.handNo);
  const phase = usePlay((s) => s.phase);
  const holes = state?.holes(seat);
  if (!holes) return null;
  const folded = state?.folded === seat;
  const showdown = phase === 'over' && state?.isShowdown;
  // dealt alternately: you, Otto, you, Otto
  const order = (i: number) => (i * 2 + (seat === HUMAN ? 0 : 1)) * 0.11;
  return (
    <div className="absolute left-1/2 flex -translate-x-1/2 gap-2" style={{ top, bottom }}>
      {holes.map((c, i) => (
        <PlayingCard
          key={`${handNo}-${seat}-${i}`}
          card={c}
          faceUp={faceUp}
          size={size}
          from={from(i)}
          delay={order(i)}
          highlight={!!showdown && winners.includes(c)}
          dim={folded}
        />
      ))}
    </div>
  );
}

function SeatBar({ state, won }: { state: HUNLState | null; won: boolean }) {
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);
  // Once the hand is settled, show your stack after the pot is paid out (each hand starts at $200).
  const settled = !!state?.terminal && last?.id === handNo;
  const stack = settled ? 10_000 + last.net : state ? state.stacks[HUMAN] : 10_000;
  const toAct = !!state && !state.terminal && state.toAct === HUMAN;
  const allIn = !!state && state.stacks[HUMAN] === 0 && !state.terminal;
  return (
    <div
      className={`absolute bottom-[4px] left-1/2 flex h-[52px] w-[300px] -translate-x-1/2 items-stretch border bg-ink-900 transition-colors ${
        won ? 'border-gold' : toAct ? 'border-ink-100' : 'border-ink-600'
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center px-4">
        <strong className="font-bold">You</strong>
      </span>
      <span
        className={`tabular flex min-w-[96px] items-center justify-end px-3 font-mono text-[19px] font-bold transition-colors ${
          toAct ? 'bg-ink-100 text-ink-950' : won ? 'text-gold' : 'text-ink-300'
        }`}
      >
        {allIn ? 'ALL-IN' : <Count value={stack} format={money} delay={won ? 1.1 : 0} />}
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
      <div className="text-center">
        <div className="text-[22px] font-extrabold">You vs Otto</div>
        <div className="mt-1 text-[14px] text-ink-400">Heads-up hold'em. $200 each. Best five-card hand wins.</div>
      </div>
      <button onClick={newHand} disabled={phase === 'loading'} className="btn btn-gold min-h-[52px] px-10 text-base">
        Deal
      </button>
    </div>
  );
}
