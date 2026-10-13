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
              <button onClick={doFold} disabled={toCall === 0} title="Fold (F)" className="btn border border-white/10 bg-white/[0.03] py-3.5 text-sm text-ink-200 hover:bg-white/[0.07]">
                Fold
              </button>
              <button onClick={doCall} title="Check / call (C)" className="btn border border-[#5fd3a0]/30 bg-[#123d2e] py-3.5 text-sm text-[#d5f5e8] hover:bg-[#16503b]">
                {toCall > 0 ? `Call ${bb(toCall)}` : 'Check'}
              </button>
              <button onClick={() => doRaise()} disabled={minTo === null} title="Bet / raise (R)" className="btn btn-gold py-3.5 text-sm">
                {to >= maxTo ? 'All-in' : raiseWord} {bb(to)}
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
                  <div className="tabular w-[92px] text-right text-sm font-semibold text-gold-hi">
                    {bb(to)} bb
                    <div className="text-[10px] font-normal text-ink-400">{pct(potFrac)} of pot</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setTo(presetTo(p.frac))}
                      className="btn rounded-lg bg-white/[0.04] px-3 py-1 text-xs text-ink-200 ring-1 ring-white/10 hover:bg-white/10"
                    >
                      {p.label}
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
              <button onClick={newHand} className="btn btn-gold px-6 py-2.5 text-sm">
                {phase === 'idle' ? 'Deal' : 'Next hand'}
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
  if (phase === 'over') return <div className="text-sm text-ink-400">Hand complete.</div>;
  if (phase === 'loading') return <div className="text-sm text-ink-300">Loading models…</div>;
  return <div className="text-sm text-ink-400">Fair deal · cryptographic shuffle · the AI sees only its own cards</div>;
}

const GRADE_STYLE: Record<string, string> = {
  Best: 'bg-[#123d2e] text-[#bfeedd] ring-[#5fd3a0]/30',
  Good: 'bg-[#123d2e] text-[#bfeedd] ring-[#5fd3a0]/20',
  Inaccuracy: 'bg-[#3a2a12] text-gold-hi ring-gold/30',
  Mistake: 'bg-[#3d1a18] text-[#f5c2b8] ring-loss/30',
  Blunder: 'bg-[#3d1a18] text-[#f5c2b8] ring-loss/40',
};

const GRADE_TEXT: Record<string, string> = {
  Best: 'Great play',
  Good: 'Good play',
  Inaccuracy: 'Slightly off',
  Mistake: 'Mistake',
  Blunder: 'Big mistake',
};

const VERB: Record<string, string> = { f: 'fold', k: 'check', c: 'call', t: 'bet small', h: 'bet half pot', p: 'bet pot', a: 'go all-in' };

function GradeToast() {
  const grades = usePlay((s) => s.humanGrades);
  const coach = usePlay((s) => s.settings.coach);
  const g = grades[grades.length - 1];
  if (!coach || !g) return null;
  const good = g.label === 'Best' || g.label === 'Good';
  return (
    <AnimatePresence>
      <motion.div
        key={grades.length}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`absolute -top-11 right-3 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs ring-1 ${GRADE_STYLE[g.label]}`}
      >
        <span className="font-bold">{good ? '✓' : '!'} {GRADE_TEXT[g.label]}</span>
        <span className="opacity-80">{good ? 'matches the solver' : `the solver prefers to ${VERB[g.bestCode] ?? g.bestCode}`}</span>
      </motion.div>
    </AnimatePresence>
  );
}
