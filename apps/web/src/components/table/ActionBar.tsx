import { type Code, DEFAULT_CONFIG, raiseToForFraction } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { money, signedMoney } from '../../lib/format';
import { HUMAN, usePlay } from '../../lib/store';

const BUY_IN = DEFAULT_CONFIG.startingStack;
/** Slider resolution; amounts snap to whole dollars and +/- move by a big blind. */
const STEPS = 1000;
const SNAP = 50;
const NUDGE = DEFAULT_CONFIG.bigBlind;

const PRESETS: Array<{ label: string; key: string; frac: number | 'min' | 'all' }> = [
  { label: '½', key: '1', frac: 0.5 },
  { label: '¾', key: '2', frac: 0.75 },
  { label: 'Pot', key: '3', frac: 1 },
  { label: 'All-in', key: '4', frac: 'all' },
];

/** Action colours: passive → aggressive (validated palette; always paired with labels). */
export const CODE_COLORS: Record<Code, string> = {
  f: 'var(--color-fold)',
  k: 'var(--color-call)',
  c: 'var(--color-call)',
  t: 'var(--color-small-lo)',
  h: 'var(--color-small)',
  p: 'var(--color-big)',
  a: 'var(--color-allin)',
};

/** Fold, check/call, small bet, big bet: dark to bright, the accent for the most aggressive. */
export const GROUP_COLORS = ['var(--color-fold)', 'var(--color-call)', 'var(--color-small)', 'var(--color-big)'];

export function ActionBar() {
  const state = usePlay((s) => s.state);
  usePlay((s) => s.version);
  const phase = usePlay((s) => s.phase);
  const humanAct = usePlay((s) => s.humanAct);
  const newHand = usePlay((s) => s.newHand);
  const busted = usePlay((s) => s.busted);
  const myTurn = phase === 'human' && state && !state.terminal && state.toAct === HUMAN;

  const toCall = state && myTurn ? state.toCall(HUMAN) : 0;
  const minTo = state && myTurn ? state.minRaiseTo(HUMAN) : null;
  const maxTo = state && myTurn ? state.allInTo(HUMAN) : 0;
  const [to, setTo] = useState(0);

  useEffect(() => {
    if (minTo !== null && state) {
      // default to a ~2/3 pot sizing
      const def = Math.max(minTo, Math.min(maxTo, raiseToForFraction(state, 0.66)));
      setTo(state.street === 0 && state.raisesThisStreet === 0 ? Math.max(minTo, Math.min(maxTo, 250)) : def);
    }
  }, [minTo, maxTo, state, state?.log.length]);

  const presetTo = (f: number | 'min' | 'all') => {
    if (!state || minTo === null) return 0;
    if (f === 'min') return minTo;
    if (f === 'all') return maxTo;
    return Math.max(minTo, Math.min(maxTo, raiseToForFraction(state, f)));
  };

  const raiseWord = state && state.street > 0 && state.streetBet[1 - HUMAN] === 0 ? 'Bet' : 'Raise to';

  const doFold = () => myTurn && toCall > 0 && humanAct({ kind: 'fold' });
  const doCall = () => myTurn && humanAct({ kind: toCall > 0 ? 'call' : 'check' });
  const doRaise = (amt = to) => myTurn && minTo !== null && humanAct({ kind: 'raise', to: amt });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (document.querySelector('[data-modal-open]')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        if (phase === 'idle' || phase === 'over') {
          e.preventDefault();
          newHand();
        }
        return;
      }
      if (!myTurn) return;
      if (k === 'f') doFold();
      else if (k === 'c' || k === 'k') doCall();
      else if (k === 'r' || k === 'b') doRaise();
      else if (k === 'a') doRaise(maxTo);
      else {
        const p = PRESETS.find((x) => x.key === k);
        if (p && minTo !== null) setTo(presetTo(p.frac));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Quadratic scale: the slider spends most of its travel on the sizes people actually bet.
  const span = minTo !== null ? maxTo - minTo : 0;
  const snap = (v: number) => {
    if (minTo === null) return 0;
    if (v >= maxTo - SNAP / 2) return maxTo;
    return Math.min(maxTo, Math.max(minTo, Math.round(v / SNAP) * SNAP));
  };
  const toPos = (v: number) => (span > 0 && minTo !== null ? Math.round(Math.sqrt(Math.max(0, v - minTo) / span) * STEPS) : STEPS);
  const fromPos = (pos: number) => snap((minTo ?? 0) + span * (pos / STEPS) ** 2);
  const nudge = (dir: 1 | -1) => setTo((v) => snap(dir > 0 ? Math.floor(v / NUDGE) * NUDGE + NUDGE : Math.ceil(v / NUDGE) * NUDGE - NUDGE));
  const pos = toPos(to);
  const fill = (pos / STEPS) * 100;
  const potPct = state && myTurn ? Math.round(((to - state.streetBet[1 - HUMAN]) / (state.pot + toCall)) * 100) : 0;
  const toCallLabel = toCall > 0 ? `Call ${money(toCall)}` : 'Check';
  const raiseLabel = `${to >= maxTo ? 'All-in' : raiseWord === 'Bet' ? 'Bet' : 'Raise'} ${money(to)}`;

  return (
    <div className="relative flex flex-col gap-3">
      <AnimatePresence mode="wait">
        {myTurn ? (
          <motion.div key="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2.5">
            {minTo !== null && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="raise-to" className="font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
                    {raiseWord === 'Bet' ? 'BET' : 'RAISE'} <span className="tabular text-ink-100">{money(to)}</span>
                    <span className="hidden sm:inline"> · {to >= maxTo ? 'ALL-IN' : state?.street === 0 ? `${+(to / DEFAULT_CONFIG.bigBlind).toFixed(1)} BB` : `${potPct}% POT`}</span>
                  </label>
                  <div className="flex gap-1">
                    {PRESETS.map((p) => {
                      const v = presetTo(p.frac);
                      return (
                        <button
                          key={p.label}
                          onClick={() => setTo(v)}
                          className={`min-h-[30px] min-w-[44px] border px-2 font-mono text-[11px] uppercase transition ${
                            v === to ? 'border-ink-100 text-ink-100' : 'border-ink-600 text-ink-400 hover:text-ink-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => nudge(-1)} disabled={to <= minTo} aria-label="Smaller" className="btn h-10 w-10 shrink-0 border border-ink-600 text-[18px] text-ink-300 hover:text-ink-100">
                    −
                  </button>
                  <input
                    id="raise-to"
                    type="range"
                    className="slider min-w-0 flex-1"
                    min={0}
                    max={STEPS}
                    step={1}
                    value={pos}
                    style={{ ['--fill' as string]: `${fill}%` }}
                    onChange={(e) => setTo(fromPos(Number(e.target.value)))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nudge(-1);
                      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nudge(1);
                      else return;
                      e.preventDefault();
                    }}
                    aria-label="Bet size"
                    aria-valuetext={money(to)}
                  />
                  <button onClick={() => nudge(1)} disabled={to >= maxTo} aria-label="Bigger" className="btn h-10 w-10 shrink-0 border border-ink-600 text-[18px] text-ink-300 hover:text-ink-100">
                    +
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={doFold} disabled={toCall === 0} title="Fold (F)" className="btn min-h-[50px] border border-ink-100 text-[15px] hover:bg-ink-800 sm:text-[16px]">
                Fold
              </button>
              <button onClick={doCall} title="Check / call (C)" className="btn min-h-[50px] border border-ink-100 text-[15px] hover:bg-ink-800 sm:text-[16px]">
                {toCallLabel}
              </button>
              <button onClick={() => doRaise()} disabled={minTo === null} title="Bet / raise (R)" className="btn btn-gold min-h-[50px] text-[15px] sm:text-[16px]">
                {raiseLabel}
              </button>
            </div>
          </motion.div>
        ) : (
          busted && (phase === 'idle' || phase === 'over') ? (
            <motion.div key="busted" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: phase === 'over' ? 0.9 : 0 }}>
              <MatchOver />
            </motion.div>
          ) : (
            <motion.div key={`wait-${phase}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[86px] flex-wrap items-center gap-x-4 gap-y-3">
              {phase === 'over' ? <ResultLine /> : <WaitingText />}
              {(phase === 'idle' || phase === 'over') && (
                <button onClick={newHand} className="btn btn-gold ml-auto min-h-[52px] shrink-0 whitespace-nowrap px-5 text-[16px] sm:px-8">
                  {phase === 'idle' ? 'Deal' : 'Next hand'}
                </button>
              )}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

function WaitingText() {
  const phase = usePlay((s) => s.phase);
  const label = phase === 'bot' ? 'OTTO IS THINKING' : phase === 'over' ? 'HAND OVER' : phase === 'loading' ? 'LOADING' : phase === 'idle' ? 'READY' : '';
  if (!label) return <div className="h-[18px]" />;
  return (
    <div className="flex min-h-[18px] items-center gap-3 font-mono text-[11px] tracking-[0.08em] text-ink-400">
      {phase === 'bot' && (
        <span className="relative h-[2px] w-16 overflow-hidden bg-ink-600">
          <span className="thinking-shimmer absolute inset-0" />
        </span>
      )}
      {label}
    </div>
  );
}

/** How the hand ended, in one line. */
function ResultLine() {
  const last = usePlay((s) => s.history[s.history.length - 1]);
  if (!last) return null;
  const won = last.net > 0;
  const sub = last.showdown
    ? last.winner === 'split'
      ? (last.humanHand ?? '')
      : last.humanHand === last.botHand
        ? `${last.humanHand} vs ${last.humanHand?.toLowerCase()} · ${won ? 'yours' : "Otto's"} is higher`
        : won
          ? `${last.humanHand} beats ${last.botHand?.toLowerCase()}`
          : `${last.botHand} beats ${last.humanHand?.toLowerCase()}`
    : won
      ? 'Otto folded'
      : 'You folded';
  return (
    <div className="flex items-baseline gap-3">
      <span className={`tabular whitespace-nowrap font-mono text-[26px] font-bold leading-none sm:text-[30px] ${won ? 'text-gold' : 'text-ink-100'}`}>
        {signedMoney(last.net)}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-400">{sub}</span>
    </div>
  );
}

/** Someone ran out of chips: the match is over until they buy back in. */
function MatchOver() {
  const busted = usePlay((s) => s.busted);
  const rebuys = usePlay((s) => s.rebuys);
  const rebuy = usePlay((s) => s.rebuy);
  const youWon = busted === 'bot';
  // a rebuy is counted when it happens, so include the match that just ended
  const won = rebuys[1] + (youWon ? 1 : 0);
  const lost = rebuys[0] + (youWon ? 0 : 1);
  return (
    <div className={`flex flex-wrap items-center gap-4 border p-4 sm:p-5 ${youWon ? 'border-gold' : 'border-ink-100'}`}>
      <div className="min-w-[200px] flex-1">
        <div className={`font-mono text-[11px] uppercase tracking-[0.08em] ${youWon ? 'text-gold' : 'text-ink-400'}`}>{youWon ? 'Match won' : 'Match lost'}</div>
        <div className="mt-1 text-[20px] font-extrabold leading-tight sm:text-[22px]">{youWon ? "You took all of Otto's chips." : 'You ran out of chips.'}</div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-400">
          Matches won {won} · lost {lost}
        </div>
      </div>
      <button onClick={rebuy} className="btn btn-gold min-h-[52px] shrink-0 whitespace-nowrap px-6 text-[16px]">
        {youWon ? 'Otto rebuys · play on' : `Rebuy ${money(BUY_IN)}`}
      </button>
    </div>
  );
}
