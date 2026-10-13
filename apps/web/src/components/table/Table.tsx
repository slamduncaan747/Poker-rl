import { type Card, type HUNLState, describeHand, evaluate } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useEffect, useState } from 'react';
import { bb, pct } from '../../lib/format';
import { bestFive } from '../../lib/hands';
import { BOT, HUMAN, usePlay } from '../../lib/store';
import { FitBox } from '../ui/FitBox';
import { BetChips } from './Chips';
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
 * construction line, player bars above and below, and numbered callouts in
 * the margins (① the bot's last action, ② the price to call, ③ your hand).
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
  const maxHeight = vp.w >= 1024 ? Math.max(420, vp.h - 250) : undefined;
  const W = narrow ? 560 : 960;
  const H = narrow ? 620 : 600;
  const gutter = narrow ? 6 : 150;
  const over = phase === 'over' && state?.terminal;
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
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[12px]" style={{ top: narrow ? 214 : 196, width: narrow ? 300 : 360 }}>
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

            {/* street bets */}
            <div className="absolute" style={{ left: W / 2 + (narrow ? 70 : 80), top: narrow ? 120 : 112 }}>
              <BetChips amount={state.terminal ? 0 : state.streetBet[BOT]} id={`bb-${handNo}-${state.street}`} color="var(--color-gold)" />
            </div>
            <div className="absolute" style={{ left: W / 2 + (narrow ? 70 : 80), bottom: narrow ? 120 : 112 }}>
              <BetChips amount={state.terminal ? 0 : state.streetBet[HUMAN]} id={`hb-${handNo}-${state.street}`} />
            </div>
          </>
        )}

        {!state && <IdleTable />}

        {/* hole cards */}
        <HoleCards seat={BOT} state={state} faceUp={showdown || (showBotCards && !!state)} winners={winners} top={narrow ? 92 : 86} size={narrow ? 'sm' : 'md'} />
        <HoleCards seat={HUMAN} state={state} faceUp={!!state} winners={winners} bottom={narrow ? 92 : 86} size={cardSize === 'lg' ? 'md' : 'md'} />

        {/* player bars */}
        <SeatBar seat={BOT} state={state} narrow={narrow} />
        <SeatBar seat={HUMAN} state={state} narrow={narrow} />

        {!narrow && state && <Callouts state={state} W={W} H={H} />}

        <AnimatePresence>{over && last && last.id === handNo && <Result key={`res-${handNo}`} narrow={narrow} W={W} H={H} />}</AnimatePresence>
      </div>
    </FitBox>
  );
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
  const stack = state ? state.stacks[seat] : 10_000;
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

function Callout({ n, children, accent, style, line }: { n: number; children: ReactNode; accent?: boolean; style: React.CSSProperties; line: React.CSSProperties }) {
  const color = accent ? 'var(--color-gold)' : 'var(--color-ink-100)';
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute flex items-center gap-2 font-mono text-[11.5px] tracking-[0.06em] whitespace-nowrap" style={{ color, ...style }}>
        <span className="balloon">{n}</span>
        {children}
      </motion.div>
      <motion.div aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute h-px" style={{ background: accent ? 'var(--color-gold)' : 'var(--color-ink-400)', ...line }} />
    </>
  );
}

function Callouts({ state, W, H }: { state: HUNLState; W: number; H: number }) {
  const phase = usePlay((s) => s.phase);
  const bubble = usePlay((s) => s.bubble);
  const live = phase !== 'over' && !state.terminal;
  const toCall = live && state.toAct === HUMAN ? state.toCall(HUMAN) : 0;
  const need = toCall > 0 ? toCall / (state.pot + toCall) : 0;
  const [a, b] = state.holes(HUMAN);
  const hand =
    state.board.length >= 3
      ? describeHand(evaluate([a, b, ...state.board]))
      : a >> 2 === b >> 2
        ? 'Pocket pair'
        : (a & 3) === (b & 3)
          ? 'Suited'
          : 'Offsuit';
  return (
    <AnimatePresence>
      {live && bubble && bubble.seat === BOT && (
        <Callout key={`c1-${bubble.id}`} n={1} accent style={{ left: 0, top: 104 }} line={{ left: 30 + bubble.text.length * 8, width: Math.max(40, W / 2 - 110 - (30 + bubble.text.length * 8)), top: 114 }}>
          {bubble.text.toUpperCase()}
        </Callout>
      )}
      {toCall > 0 && (
        <Callout key="c2" n={2} style={{ right: 0, top: H / 2 - 4 }} line={{ right: 112, width: 70, top: H / 2 + 6 }}>
          NEED {pct(need)}
        </Callout>
      )}
      <Callout key="c3" n={3} style={{ left: 0, bottom: 104 }} line={{ left: 36 + hand.length * 8, width: Math.max(40, W / 2 - 80 - (36 + hand.length * 8)), bottom: 114 }}>
        {hand.toUpperCase()}
      </Callout>
    </AnimatePresence>
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

function Result({ narrow, W, H }: { narrow: boolean; W: number; H: number }) {
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const newHand = usePlay((s) => s.newHand);
  const autoDeal = usePlay((s) => s.settings.autoDeal);
  const [show, setShow] = useState(!last?.showdown);
  useEffect(() => {
    if (!last?.showdown) return;
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [last]);
  if (!last || !show) return null;
  const won = last.net > 0;
  const split = last.winner === 'split';
  const amt = Math.abs(last.net) / 100;
  const sub = last.showdown
    ? split
      ? (last.humanHand ?? '')
      : won
        ? `${last.humanHand} > ${last.botHand}`
        : `${last.botHand} > ${last.humanHand}`
    : won
      ? 'It folded'
      : 'You folded';
  const pos: React.CSSProperties = narrow ? { left: '50%', top: 150, transform: 'translateX(-50%)' } : { left: 0, top: H / 2 - 70, width: 150 };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute z-30" style={pos}>
      <div className={`flex border bg-ink-900 ${narrow ? 'items-center gap-4 px-4 py-2.5' : 'flex-col items-start gap-2 px-3.5 py-3'} ${won ? 'border-gold' : 'border-ink-500'}`}>
        <div>
          <div className={`tabular font-mono text-[28px] font-bold leading-none ${won ? 'text-gold' : split ? 'text-ink-100' : 'text-ink-300'}`}>
            {split ? '±0' : `${won ? '+' : '−'}${amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(1)}`}
          </div>
          <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400" style={{ maxWidth: narrow ? 200 : 130 }}>
            {sub}
          </div>
        </div>
        {!autoDeal && (
          <button onClick={newHand} className="btn min-h-[40px] border border-ink-100 px-4 text-sm hover:bg-ink-800">
            Next
          </button>
        )}
      </div>
      {!narrow && <div aria-hidden="true" className="absolute h-px bg-ink-500" style={{ left: 150, top: 70, width: W / 2 - 150 - 200 }} />}
    </motion.div>
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
