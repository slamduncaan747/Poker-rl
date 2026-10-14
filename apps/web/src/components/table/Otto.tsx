import type { HUNLState } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { money } from '../../lib/format';
import { OTTO } from '../../lib/otto';
import { BOT, type BotDecisionView, usePlay } from '../../lib/store';
import { GROUP_COLORS } from './ActionBar';
import { Count } from '../ui/Count';

export type Mood = 'idle' | 'thinking' | 'reading' | 'won' | 'lost';

/** Otto's face: a drawn square head whose eyes and mouth change with its mood. */
export function OttoFace({ mood, size = 44 }: { mood: Mood; size?: number }) {
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

/** Otto's seat: face, name and stack, its last action, and its reasoning on hover. */
export function OttoSeat({ state, stack, toAct, won, width, left }: { state: HUNLState | null; stack: number; toAct: boolean; won: boolean; width: number; left?: number }) {
  const phase = usePlay((s) => s.phase);
  const decisions = usePlay((s) => s.botDecisions);
  const bubble = usePlay((s) => s.bubble);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const handNo = usePlay((s) => s.handNo);
  const [open, setOpen] = useState(false);
  const d = decisions[decisions.length - 1];
  const settled = phase === 'over' && last?.id === handNo;
  const mood: Mood =
    phase === 'bot' ? 'thinking' : settled ? (last.net < 0 ? 'won' : last.net > 0 ? 'lost' : 'idle') : d?.explanation.tone === 'exploit' ? 'reading' : 'idle';
  const action = !settled && bubble && bubble.seat === BOT ? bubble.text : null;
  const allIn = !!state && state.stacks[BOT] === 0 && !state.terminal;

  return (
    <div className={`absolute top-[4px] z-30 ${left === undefined ? 'left-1/2 -translate-x-1/2' : ''}`} style={{ width, left }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={`${OTTO}'s reasoning`}
        className={`flex h-[52px] w-full items-stretch border bg-ink-900 text-left ${won ? 'border-gold' : toAct ? 'border-ink-100' : 'border-ink-600'}`}
      >
        <span className="grid w-[52px] place-items-center border-r border-ink-600">
          <OttoFace mood={mood} size={38} />
        </span>
        <span className="flex min-w-0 flex-1 items-center px-3">
          <strong className="font-bold">{OTTO}</strong>
        </span>
        <span className="tabular flex min-w-[96px] items-center justify-end px-3 font-mono text-[19px] font-bold text-ink-300">
          {allIn ? 'ALL-IN' : <Count value={stack} format={money} delay={won ? 1.1 : 0} />}
        </span>
      </button>

      {/* speech bubble */}
      <AnimatePresence mode="wait">
        {state && action && (
          <motion.div
            key={`${handNo}-${bubble?.id}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-full top-1/2 ml-4 -translate-y-1/2 whitespace-nowrap border border-ink-100 bg-ink-950 px-3 py-1.5"
          >
            <span aria-hidden="true" className="absolute -left-[7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-ink-100 bg-ink-950" />
            <div className="font-mono text-[12px] font-bold uppercase tracking-[0.08em]">{action}</div>
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
            className="glass absolute left-0 top-full z-40 mt-2 flex w-[320px] flex-col gap-3 p-4 text-left"
          >
            <Thinking d={d} revealed={phase === 'over' || phase === 'idle'} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STRENGTH = ['very weak', 'weak', 'medium', 'strong', 'very strong'];
const GROUP_WORDS = ['Fold', 'Check / call', 'Small bet', 'Big bet'];

/** Otto's reasoning for its last decision; its hand strength and mix unlock after the hand. */
function Thinking({ d, revealed }: { d: BotDecisionView; revealed: boolean }) {
  const { info, explanation: ex } = d;
  const strength = STRENGTH[Math.min(4, Math.floor(info.strength * 5))];
  return (
    <>
      <div>
        <div className="text-[19px] font-extrabold leading-tight">{d.label}</div>
        <p className="mt-1 text-[14px] leading-snug text-ink-200">{ex.headline}</p>
        {ex.reasons.slice(0, 1).map((r) => (
          <p key={r.stat} className="mt-2 border-l-2 border-gold pl-3 text-[13px] leading-snug text-ink-300">
            {r.sentence}
          </p>
        ))}
      </div>
      {revealed ? (
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
            My hand was <span className="text-ink-100">{strength}</span>
          </div>
          <Mix label="Balanced" values={info.groupBlueprint} />
          {info.lambda > 0 && <Mix label="Vs you" values={info.groupFinal} />}
          <div className="flex flex-wrap gap-x-3 text-[11px] text-ink-400">
            {GROUP_WORDS.map((g, i) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="h-2 w-2" style={{ background: GROUP_COLORS[i] }} />
                {g}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="font-mono text-[10.5px] tracking-[0.08em] text-ink-500">MY CARDS SHOW AFTER THE HAND</div>
      )}
    </>
  );
}

function Mix({ label, values }: { label: string; values: number[] }) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-400">{label}</span>
      <div className="flex h-2 gap-[2px]">
        {values.map((v, i) => (v > 0.004 ? <span key={i} style={{ width: `${v * 100}%`, background: GROUP_COLORS[i] }} /> : null))}
      </div>
    </div>
  );
}
