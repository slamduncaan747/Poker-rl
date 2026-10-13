import type { HUNLState } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { bb } from '../../lib/format';
import { NASH, quip } from '../../lib/nash';
import { BOT, usePlay } from '../../lib/store';
import { DecisionView } from '../brain/BrainTab';

export type Mood = 'idle' | 'thinking' | 'reading' | 'won' | 'lost';

/** Nash's face: a drawn square head whose eyes and mouth change with its mood. */
export function NashFace({ mood, size = 44 }: { mood: Mood; size?: number }) {
  const eye = mood === 'reading' ? 'var(--color-gold)' : 'var(--color-ink-100)';
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="40" height="40" fill="var(--color-ink-900)" stroke="var(--color-ink-100)" strokeWidth="1.5" />
      {/* brows: one raised while it is reading you */}
      <line x1="10" y1={mood === 'reading' ? 13 : 15} x2="18" y2={mood === 'reading' ? 11 : 15} stroke="var(--color-ink-100)" strokeWidth="1.5" />
      <line x1="26" y1="15" x2="34" y2="15" stroke="var(--color-ink-100)" strokeWidth="1.5" />
      {/* eyes drift while it thinks */}
      <motion.g animate={mood === 'thinking' ? { x: [0, 3, -3, 0] } : { x: 0 }} transition={mood === 'thinking' ? { repeat: Infinity, duration: 1.6 } : { duration: 0.2 }}>
        <rect x="12" y="19" width="4" height="5" fill={eye} />
        <rect x="28" y="19" width="4" height="5" fill={eye} />
      </motion.g>
      {mood === 'won' ? (
        <path d="M13 30 Q22 37 31 30" fill="none" stroke="var(--color-ink-100)" strokeWidth="1.5" />
      ) : mood === 'lost' ? (
        <path d="M13 34 Q22 28 31 34" fill="none" stroke="var(--color-ink-100)" strokeWidth="1.5" />
      ) : (
        <line x1="15" y1="32" x2={mood === 'reading' ? 27 : 29} y2={mood === 'reading' ? 30 : 32} stroke="var(--color-ink-100)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** Nash's seat: face, name and stack, a speech bubble after it acts, and its reasoning on hover. */
export function NashSeat({ state, stack, toAct, width, left }: { state: HUNLState | null; stack: number; toAct: boolean; width: number; left?: number }) {
  const phase = usePlay((s) => s.phase);
  const decisions = usePlay((s) => s.botDecisions);
  const bubble = usePlay((s) => s.bubble);
  const bot = usePlay((s) => s.bot);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);
  const lambda = usePlay((s) => s.settings.lambda);
  const [open, setOpen] = useState(false);
  const d = decisions[decisions.length - 1];
  const settled = phase === 'over' && last?.id === handNo;
  const mood: Mood =
    phase === 'bot' ? 'thinking' : settled ? (last.net < 0 ? 'won' : last.net > 0 ? 'lost' : 'idle') : d?.explanation.tone === 'exploit' ? 'reading' : 'idle';
  const snap = bot ? bot.model.snapshot() : null;
  const line = phase === 'bot' ? '…' : settled ? (last.net < 0 ? 'Good hand for me.' : last.net > 0 ? 'Nicely played.' : 'Split it.') : quip(d, snap);
  const action = !settled && bubble && bubble.seat === BOT ? bubble.text : null;
  const allIn = !!state && state.stacks[BOT] === 0 && !state.terminal;
  const isButton = state?.button === BOT;

  return (
    <div className={`absolute top-[4px] z-30 ${left === undefined ? 'left-1/2 -translate-x-1/2' : ''}`} style={{ width, left }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={`${NASH}'s reasoning`}
        className={`flex h-[52px] w-full items-stretch border bg-ink-900 text-left ${toAct ? 'border-ink-100' : 'border-ink-600'}`}
      >
        <span className="grid w-[52px] place-items-center border-r border-ink-600">
          <NashFace mood={mood} size={38} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <strong className="font-bold">{NASH}</strong>
          {isButton && <span className="font-mono text-[10px] text-ink-400">D</span>}
          <span className={`font-mono text-[10px] tracking-[0.08em] ${lambda > 0 ? 'text-gold' : 'text-ink-400'}`}>{lambda > 0 ? 'ADAPTIVE' : 'BALANCED'}</span>
        </span>
        <span className="tabular flex min-w-[80px] items-center justify-end border-l border-ink-600 px-3 font-mono text-[19px] font-bold text-ink-300">
          {allIn ? 'ALL-IN' : bb(stack, stack % 100 === 0 ? 0 : 1)}
        </span>
      </button>

      {/* speech bubble */}
      <AnimatePresence mode="wait">
        {state && line && (
          <motion.div
            key={`${handNo}-${line}-${action ?? ''}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-full top-1/2 ml-4 -translate-y-1/2 whitespace-nowrap border border-ink-100 bg-ink-950 px-3 py-1.5"
          >
            <span aria-hidden="true" className="absolute -left-[7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-ink-100 bg-ink-950" />
            {action && <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-gold">{action}</div>}
            <div className="text-[14px]">{line}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* reasoning on hover */}
      <AnimatePresence>
        {open && d && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass absolute left-0 top-full z-40 mt-2 flex w-[340px] flex-col gap-3 p-4 text-left"
          >
            <DecisionView d={d} revealed={phase === 'over' || phase === 'idle'} fromLastHand={false} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
