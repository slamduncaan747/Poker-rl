import { type Code, raiseToForFraction } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { bb, pct } from '../../lib/format';
import { HUMAN, usePlay } from '../../lib/store';

const PRESETS: Array<{ label: string; key: string; frac: number | 'min' | 'all' }> = [
  { label: 'Min', key: '1', frac: 'min' },
  { label: '⅓', key: '2', frac: 1 / 3 },
  { label: '½', key: '3', frac: 0.5 },
  { label: '¾', key: '4', frac: 0.75 },
  { label: 'Pot', key: '5', frac: 1 },
  { label: 'All-in', key: '6', frac: 'all' },
];

/** Action colours: passive → aggressive (validated palette; always paired with labels). */
export const CODE_COLORS: Record<Code, string> = {
  f: '#4a4f56',
  k: '#8c929a',
  c: '#8c929a',
  t: '#cdcac3',
  h: '#e6e3dc',
  p: '#e8743b',
  a: '#b8542a',
};

/** Fold, check/call, small bet, big bet: dark to bright, the accent for the most aggressive. */
export const GROUP_COLORS = ['#4a4f56', '#8c929a', '#e6e3dc', '#e8743b'];

export function ActionBar() {
  const state = usePlay((s) => s.state);
  usePlay((s) => s.version);
  const phase = usePlay((s) => s.phase);
  const humanAct = usePlay((s) => s.humanAct);
  const newHand = usePlay((s) => s.newHand);
  const requestHint = usePlay((s) => s.requestHint);
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
      if (k === 'h') requestHint();
      else if (k === 'f') doFold();
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
  const potFrac = useMemo(() => {
    if (!state || minTo === null) return 0;
    const cur = state.streetBet[1 - HUMAN];
    return (to - cur) / (state.pot + toCall);
  }, [state, to, toCall, minTo]);

  const toCallLabel = toCall > 0 ? `Call ${bb(toCall)}` : 'Check';
  const raiseLabel = `${to >= maxTo ? 'All-in' : raiseWord === 'Bet' ? 'Bet' : 'Raise'} ${bb(to)}`;

  return (
    <div className="relative flex flex-col gap-3">
      <AnimatePresence mode="wait">
        {myTurn ? (
          <motion.div key="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2.5">
            {minTo !== null && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between font-mono text-[11px] tracking-[0.06em]">
                  <label htmlFor="raise-to" className="text-ink-400">
                    {raiseWord === 'Bet' ? 'BET' : 'RAISE TO'}
                  </label>
                  <span className="tabular text-ink-100">
                    {bb(to)} <span className="text-ink-400">· {pct(potFrac)} POT</span>
                  </span>
                  <HintButton />
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
                />
                <div className="ruler hidden sm:block" aria-hidden="true" />
                <div className="hidden grid-cols-6 font-mono text-[11px] sm:grid">
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={() => setTo(presetTo(p.frac))}
                      title={`${p.label} (${p.key})`}
                      className={`min-h-[32px] uppercase text-ink-400 hover:text-ink-100 ${i === 0 ? 'text-left' : i === PRESETS.length - 1 ? 'text-right' : ''}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={doFold} disabled={toCall === 0} title="Fold (F)" className="btn min-h-[50px] border border-ink-100 text-[15px] hover:bg-ink-800 sm:text-[16px]">
                Fold <span className="kbd">F</span>
              </button>
              <button onClick={doCall} title="Check / call (C)" className="btn min-h-[50px] border border-ink-100 text-[15px] hover:bg-ink-800 sm:text-[16px]">
                {toCallLabel} <span className="kbd">C</span>
              </button>
              <button onClick={() => doRaise()} disabled={minTo === null} title="Bet / raise (R)" className="btn btn-gold min-h-[50px] text-[15px] sm:text-[16px]">
                {raiseLabel} <span className="kbd">R</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key={`wait-${phase}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[86px] items-center gap-4">
            {phase === 'over' ? <ResultLine /> : <WaitingText />}
            {(phase === 'idle' || phase === 'over') && (
              <button onClick={newHand} className="btn btn-gold ml-auto min-h-[52px] shrink-0 whitespace-nowrap px-5 text-[16px] sm:px-8">
                {phase === 'idle' ? 'Deal' : 'Next hand'} <span className="kbd">SPACE</span>
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
  const label = phase === 'bot' ? 'NASH IS THINKING' : phase === 'over' ? 'HAND OVER' : phase === 'loading' ? 'LOADING' : phase === 'idle' ? 'READY' : '';
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

const VERB: Record<string, string> = { f: 'fold', k: 'check', c: 'call', t: 'bet ⅓', h: 'bet ½', p: 'bet pot', a: 'all-in' };

/** The solver's suggestion for this spot, on request. */
function HintButton() {
  const hint = usePlay((s) => s.hint);
  const requestHint = usePlay((s) => s.requestHint);
  const coach = usePlay((s) => s.settings.coach);
  if (!coach) return null;
  if (!hint)
    return (
      <button onClick={requestHint} className="ml-3 border border-dashed border-ink-500 px-2 py-0.5 text-ink-300 hover:border-ink-100 hover:text-ink-100">
        HINT <span className="kbd">H</span>
      </button>
    );
  const top = hint.codes
    .map((c, i) => ({ c, p: hint.probs[i] }))
    .filter((x) => x.p >= 0.12)
    .sort((x, y) => y.p - x.p)
    .slice(0, 2);
  return (
    <span className="ml-3 uppercase text-gold">
      {top.map((x) => `${VERB[x.c]} ${pct(x.p)}`).join(' · ')}
    </span>
  );
}

/** How the hand ended, in one line. */
function ResultLine() {
  const last = usePlay((s) => s.history[s.history.length - 1]);
  if (!last) return null;
  const won = last.net > 0;
  const amt = Math.abs(last.net) / 100;
  const sub = last.showdown
    ? last.winner === 'split'
      ? (last.humanHand ?? '')
      : won
        ? `${last.humanHand} beats ${last.botHand}`
        : `${last.botHand} beats ${last.humanHand}`
    : won
      ? 'Nash folded'
      : 'You folded';
  return (
    <div className="flex items-baseline gap-3">
      <span className={`tabular font-mono text-[30px] font-bold leading-none ${won ? 'text-gold' : 'text-ink-100'}`}>
        {last.winner === 'split' ? '±0' : `${won ? '+' : '−'}${amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(1)}`}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-400">{sub}</span>
    </div>
  );
}
