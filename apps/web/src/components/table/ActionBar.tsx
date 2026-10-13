import { CODE_LABELS, type Code, raiseToForFraction } from '@poker-rl/engine';
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
  f: '#6d83c9',
  k: '#199e70',
  c: '#199e70',
  t: '#e0a526',
  h: '#c98500',
  p: '#e5484d',
  a: '#b8283a',
};

export const GROUP_COLORS = ['#6d83c9', '#199e70', '#c98500', '#e5484d'];

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
  const potFrac = useMemo(() => {
    if (!state || minTo === null) return 0;
    const cur = state.streetBet[1 - HUMAN];
    return (to - cur) / (state.pot + toCall);
  }, [state, to, toCall, minTo]);

  return (
    <div className="glass relative rounded-2xl p-3 sm:p-4">
      <AnimatePresence mode="wait">
        {myTurn ? (
          <motion.div key="act" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid grid-cols-3 gap-2 lg:w-[400px] lg:shrink-0">
              <button onClick={doFold} disabled={toCall === 0} className="btn bg-slate-700/80 py-3 text-sm hover:bg-slate-600">
                Fold <span className="kbd">F</span>
              </button>
              <button onClick={doCall} className="btn bg-emerald-600 py-3 text-sm text-white shadow-[0_8px_24px_-10px_rgba(16,185,129,0.8)] hover:bg-emerald-500">
                {toCall > 0 ? `Call ${bb(toCall)}` : 'Check'} <span className="kbd">C</span>
              </button>
              <button
                onClick={() => doRaise()}
                disabled={minTo === null}
                className="btn bg-gradient-to-b from-rose-500 to-rose-600 py-3 text-sm text-white shadow-[0_8px_24px_-10px_rgba(244,63,94,0.8)] hover:from-rose-400 hover:to-rose-500"
              >
                {to >= maxTo ? 'All-in' : raiseWord} {bb(to)} <span className="kbd">R</span>
              </button>
            </div>
            {minTo !== null && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    className="slider flex-1"
                    min={minTo}
                    max={maxTo}
                    step={10}
                    value={to}
                    style={{ ['--fill' as string]: `${fill}%` }}
                    onChange={(e) => setTo(Number(e.target.value))}
                    aria-label="Raise amount"
                  />
                  <div className="tabular w-[92px] text-right font-mono text-sm text-amber-200">
                    {bb(to)} bb
                    <div className="text-[10px] text-ink-400">{pct(potFrac)} pot</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setTo(presetTo(p.frac))}
                      className="btn rounded-lg bg-white/5 px-2.5 py-1 text-xs text-ink-200 ring-1 ring-white/10 hover:bg-white/10"
                    >
                      {p.label}
                      <span className="kbd">{p.key}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-[52px] items-center justify-between gap-3 px-1">
            <WaitingText />
            {(phase === 'idle' || phase === 'over') && (
              <button onClick={newHand} className="btn bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm text-amber-950 hover:from-amber-200">
                {phase === 'idle' ? 'Deal' : 'Next hand'} <span className="kbd border-amber-900/30">Space</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <GradeToast />
    </div>
  );
}

function WaitingText() {
  const phase = usePlay((s) => s.phase);
  if (phase === 'bot')
    return (
      <div className="flex items-center gap-3 text-sm text-ink-300">
        <div className="relative h-2 w-28 overflow-hidden rounded-full bg-white/5">
          <div className="thinking-shimmer absolute inset-0" />
        </div>
        Poker RL is thinking…
      </div>
    );
  if (phase === 'over') return <div className="text-sm text-ink-300">Hand complete.</div>;
  if (phase === 'loading') return <div className="text-sm text-ink-300">Loading models…</div>;
  return <div className="text-sm text-ink-300">Heads-up · 100bb deep · blinds 0.5/1</div>;
}

const GRADE_STYLE: Record<string, string> = {
  Best: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  Good: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  Inaccuracy: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  Mistake: 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
  Blunder: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
};

function GradeToast() {
  const grades = usePlay((s) => s.humanGrades);
  const coach = usePlay((s) => s.settings.coach);
  const g = grades[grades.length - 1];
  if (!coach || !g) return null;
  const top = g.codes
    .map((c, i) => ({ c, p: g.probs[i] }))
    .filter((x) => x.p > 0.04)
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  return (
    <AnimatePresence>
      <motion.div
        key={grades.length}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`absolute -top-11 right-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ring-1 ${GRADE_STYLE[g.label]}`}
      >
        <span className="font-bold">{g.label}</span>
        <span className="text-ink-300">
          GTO: {top.map((x) => `${CODE_LABELS[x.c]} ${pct(x.p)}`).join(' · ')}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
