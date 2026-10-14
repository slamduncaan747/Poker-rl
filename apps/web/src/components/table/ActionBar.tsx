import { type Code, raiseToForFraction } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { money, signedMoney } from '../../lib/format';
import { HUMAN, usePlay } from '../../lib/store';

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

  const fill = minTo !== null && maxTo > minTo ? ((to - minTo) / (maxTo - minTo)) * 100 : 100;
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
                    {raiseWord === 'Bet' ? 'BET SIZE' : 'RAISE SIZE'}
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
                <input
                  id="raise-to"
                  type="range"
                  className="slider w-full"
                  min={minTo}
                  max={maxTo}
                  step={10}
                  value={to}
                  style={{ ['--fill' as string]: `${fill}%` }}
                  onChange={(e) => setTo(Number(e.target.value))}
                  aria-label="Bet size"
                />
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
          <motion.div key={`wait-${phase}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[86px] items-center gap-4">
            {phase === 'over' ? <ResultLine /> : <WaitingText />}
            {(phase === 'idle' || phase === 'over') && (
              <button onClick={newHand} className="btn btn-gold ml-auto min-h-[52px] shrink-0 whitespace-nowrap px-5 text-[16px] sm:px-8">
                {phase === 'idle' ? 'Deal' : 'Next hand'}
              </button>
            )}
          </motion.div>
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
