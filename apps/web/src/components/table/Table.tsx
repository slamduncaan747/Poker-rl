import { type Card, type HUNLState } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { bb } from '../../lib/format';
import { bestFive } from '../../lib/hands';
import { BOT, HUMAN, type ActionBubble, usePlay } from '../../lib/store';
import { FitBox } from '../ui/FitBox';
import { BetChips, ChipStack } from './Chips';
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

export function Table() {
  const state = usePlay((s) => s.state);
  usePlay((s) => s.version);
  const phase = usePlay((s) => s.phase);
  const bubble = usePlay((s) => s.bubble);
  const showBotCards = usePlay((s) => s.settings.showBotCards);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);

  const vp = useViewport();
  const narrow = vp.w < 720;
  // On desktop, keep the whole play area (header, table, controls) inside one screen.
  const maxHeight = vp.w >= 1024 ? Math.max(420, vp.h - 330) : undefined;
  const W = narrow ? 600 : 960;
  const H = narrow ? 560 : 610;
  const inset = narrow ? 8 : 40;
  const over = phase === 'over' && state?.terminal;
  const showdown = !!(over && state?.isShowdown);
  const winners: Card[] = showdown && state ? winningCards(state) : [];

  return (
    <FitBox width={W} height={H} maxHeight={maxHeight}>
      <div className="relative" style={{ width: W, height: H }}>
        {/* table */}
        <div className={`table-rail absolute ${narrow ? 'rounded-[180px]' : 'rounded-[999px]'} p-[16px]`} style={{ left: inset, right: inset, top: 70, bottom: 70 }}>
          <div className={`table-felt relative h-full w-full overflow-hidden ${narrow ? 'rounded-[170px]' : 'rounded-[999px]'}`}>
            <div className="felt-noise pointer-events-none absolute inset-0" />
            <div className="spotlight pointer-events-none absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-0 bottom-[23%] text-center font-display text-[22px] italic tracking-[0.12em] text-[#d6b26e]/20">
              Poker RL
            </div>
            <div className="pointer-events-none absolute left-1/2 top-[18%] h-[64%] w-[78%] -translate-x-1/2 rounded-[999px] border border-[#d6b26e]/10" />

            {state && (
              <>
                {/* pot */}
                <div className="absolute left-1/2 top-[29%] flex -translate-x-1/2 flex-col items-center gap-1">
                  <AnimatePresence>
                    {potInMiddle(state) > 0 && (
                      <motion.div key={`pot-${handNo}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <ChipStack amount={potInMiddle(state)} size={24} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="tabular text-[11px] font-semibold uppercase tracking-[0.2em] text-[#efe9dc]/55">
                    Pot {bb(state.pot)} bb
                  </div>
                </div>

                {/* board */}
                <div className="absolute left-1/2 top-[55%] flex -translate-x-1/2 -translate-y-1/2 gap-2.5">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const c = state.board[i];
                    return c !== undefined ? (
                      <PlayingCard
                        key={`${handNo}-b${i}`}
                        card={c}
                        size="lg"
                        delay={i < 3 ? i * 0.09 : 0}
                        highlight={winners.includes(c)}
                        dim={showdown && winners.length > 0 && !winners.includes(c)}
                      />
                    ) : (
                      <div key={`slot${i}`} className="h-[110px] w-[78px] rounded-[10px] border border-[#d6b26e]/10 bg-black/10" />
                    );
                  })}
                </div>

                {/* street bets */}
                <div className="absolute left-[60%] top-[17%] -translate-x-1/2">
                  <BetChips amount={state.terminal ? 0 : state.streetBet[BOT]} id={`bb-${handNo}-${state.street}`} />
                </div>
                <div className="absolute bottom-[17%] left-[60%] -translate-x-1/2">
                  <BetChips amount={state.terminal ? 0 : state.streetBet[HUMAN]} id={`hb-${handNo}-${state.street}`} />
                </div>
              </>
            )}

            {!state && <IdleFelt />}
          </div>
        </div>

        {/* seats */}
        <Seat seat={BOT} state={state} bubble={bubble} faceUp={showdown || (showBotCards && !!state)} winners={winners} thinking={phase === 'bot'} />
        <Seat seat={HUMAN} state={state} bubble={bubble} faceUp={!!state} winners={winners} thinking={phase === 'human'} />

        {/* result banner */}
        <AnimatePresence>
          {over && last && last.id === handNo && <ResultBanner key={`res-${handNo}`} narrow={narrow} />}
        </AnimatePresence>
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

function IdleFelt() {
  const newHand = usePlay((s) => s.newHand);
  const phase = usePlay((s) => s.phase);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
      <div className="flex -space-x-6">
        {[51, 47, 43].map((c, i) => (
          <motion.div key={c} initial={{ rotate: 0, y: 20, opacity: 0 }} animate={{ rotate: (i - 1) * 12, y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.1, type: 'spring' }}>
            <PlayingCard card={c} size="lg" />
          </motion.div>
        ))}
      </div>
      <button
        onClick={newHand}
        disabled={phase === 'loading'}
        className="btn btn-gold px-8 py-3 text-base"
      >
        Deal the first hand
      </button>
    </div>
  );
}

interface SeatProps {
  seat: number;
  state: HUNLState | null;
  bubble: ActionBubble | null;
  faceUp: boolean;
  winners: Card[];
  thinking: boolean;
}

function Seat({ seat, state, bubble, faceUp, winners, thinking }: SeatProps) {
  const isBot = seat === BOT;
  const handNo = usePlay((s) => s.handNo);
  const phase = usePlay((s) => s.phase);
  const top = isBot;
  const holes = state?.holes(seat);
  const folded = state?.folded === seat;
  const isButton = state?.button === seat;
  const toAct = state && !state.terminal && state.toAct === seat;
  const stack = state ? state.stacks[seat] : 10_000;
  const allIn = state && state.stacks[seat] === 0 && !state.terminal;
  const showdown = phase === 'over' && state?.isShowdown;

  return (
    <div className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center ${top ? 'top-0' : 'bottom-0'}`}>
      {/* cards */}
      <div className={`relative z-0 flex gap-1.5 ${top ? 'order-2 -mt-3' : 'order-1 -mb-3'}`}>
        {holes &&
          holes.map((c, i) => (
            <motion.div key={`${handNo}-${seat}-${i}`} animate={{ rotate: (i === 0 ? -5 : 5) * (top ? -1 : 1), y: folded ? (top ? -12 : 12) : 0 }}>
              <PlayingCard
                card={c}
                faceUp={faceUp}
                size="md"
                from={{ x: 0, y: top ? 120 : -120 }}
                delay={i * 0.12 + (isBot ? 0.06 : 0)}
                highlight={!!showdown && winners.includes(c)}
                dim={folded}
              />
            </motion.div>
          ))}
      </div>

      {/* plate */}
      <div className={`relative z-10 ${top ? 'order-1' : 'order-2'}`}>
        <div
          className={`glass relative flex w-[210px] items-center gap-3 rounded-2xl px-3 py-2.5 ${toAct ? 'turn-glow' : ''}`}
          style={{ borderColor: toAct ? 'rgba(251,191,36,0.6)' : undefined }}
        >
          {isBot ? <BotAvatar thinking={thinking && !!toAct} /> : <HumanAvatar />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-display text-[17px] font-semibold leading-none">
              {isBot ? 'Poker RL' : 'You'}
              {isButton && (
                <span title="Dealer button" className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-b from-[#fffdf8] to-[#d9d0bd] font-sans text-[10px] font-black text-[#241a08] shadow">
                  D
                </span>
              )}
              {state && !isButton && <span className="rounded bg-white/10 px-1 font-sans text-[9px] font-bold text-ink-300">BB</span>}
            </div>
            <div className="tabular text-[13px] font-semibold text-gold-hi">
              {allIn ? <span className="font-bold text-loss">All-in</span> : `${bb(stack)} bb`}
            </div>
            {isBot && <BotSubtitle />}
          </div>
        </div>
        {/* action bubble */}
        <AnimatePresence>
          {bubble && bubble.seat === seat && phase !== 'over' && (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, x: 8, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute right-full top-1/2 z-20 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shadow-lg ${bubbleColor(
                bubble.kind,
              )}`}
            >
              {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function bubbleColor(kind: string) {
  switch (kind) {
    case 'fold':
      return 'bg-ink-700 text-ink-200 ring-1 ring-white/10';
    case 'check':
    case 'call':
      return 'bg-[#123d2e] text-[#bfeedd] ring-1 ring-[#5fd3a0]/30';
    default:
      return 'bg-[#3a2a12] text-gold-hi ring-1 ring-gold/40';
  }
}

function BotSubtitle() {
  const lambda = usePlay((s) => s.settings.lambda);
  const hands = usePlay((s) => s.bot?.model.hands ?? 0);
  usePlay((s) => s.version);
  return (
    <div className="mt-0.5 truncate text-[10.5px] text-ink-400">
      {lambda === 0 ? 'Balanced mode' : hands < 10 ? 'Adaptive · learning you' : `Adaptive · ${hands} hands read`}
    </div>
  );
}

export function BotAvatar({ thinking, size = 44 }: { thinking: boolean; size?: number }) {
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 0deg, #f0d9a4, #8a6a30, #d6b26e, #3d2e14, #f0d9a4)' }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: thinking ? 1.2 : 8, ease: 'linear' }}
      />
      <div className="absolute inset-[2px] rounded-full bg-ink-900" />
      <motion.div
        className="relative h-[46%] w-[46%] rounded-full"
        style={{ background: 'radial-gradient(circle at 35% 30%, #fff1cf, #d6b26e 45%, #3d2e14)' }}
        animate={thinking ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ repeat: Infinity, duration: 0.9 }}
      />
    </div>
  );
}

function HumanAvatar() {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f0d9a4] to-[#9c7a3e] font-display text-xl font-bold text-[#241a08] ring-2 ring-[#d6b26e]/30">
      Y
    </div>
  );
}

function ResultBanner({ narrow }: { narrow: boolean }) {
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const newHand = usePlay((s) => s.newHand);
  const autoDeal = usePlay((s) => s.settings.autoDeal);
  const [show, setShow] = useState(!last?.showdown);
  useEffect(() => {
    if (!last?.showdown) return;
    const t = setTimeout(() => setShow(true), 900);
    return () => clearTimeout(t);
  }, [last]);
  if (!last || !show) return null;
  const won = last.net > 0;
  const split = last.winner === 'split';
  const amt = Math.abs(last.net) / 100;
  const title = split ? 'Split pot' : won ? `You win ${amt.toFixed(1)} bb` : `Poker RL wins ${amt.toFixed(1)} bb`;
  const sub = last.showdown
    ? split
      ? last.humanHand
      : won
        ? `${last.humanHand} beats ${last.botHand}`
        : `${last.botHand} beats ${last.humanHand}`
    : won
      ? 'Poker RL folds'
      : 'You folded';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={narrow ? 'absolute left-1/2 top-[17%] z-30 -translate-x-1/2' : 'absolute left-[58px] top-1/2 z-30 w-[188px] -translate-y-1/2'}
    >
      {won && <Burst />}
      <div
        className={`glass relative flex ${narrow ? 'items-center gap-4' : 'flex-col items-start gap-3'} rounded-2xl px-5 py-3.5 ${
          won ? 'ring-1 ring-win/40' : split ? '' : 'ring-1 ring-loss/30'
        }`}
      >
        <div>
          <div className={`font-display text-[24px] font-semibold leading-tight ${won ? 'text-win' : split ? 'text-ink-100' : 'text-loss'}`}>{title}</div>
          <div className="text-xs text-ink-300">{sub}</div>
        </div>
        {!autoDeal && (
          <button onClick={newHand} className="btn whitespace-nowrap bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            Next hand
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Burst() {
  const parts = Array.from({ length: 22 });
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2">
      {parts.map((_, i) => {
        const a = (i / parts.length) * Math.PI * 2;
        const r = 90 + (i % 3) * 40;
        return (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: ['#f0d9a4', '#d6b26e', '#5fd3a0', '#efe9dc'][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6, opacity: 0, scale: 0.3 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
