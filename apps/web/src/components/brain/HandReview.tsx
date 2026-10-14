import { CODE_LABELS, type Code, accuracy } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { pct, signedMoney } from '../../lib/format';
import { MARKS, type Mark, markOf } from '../../lib/otto';
import { type HandSummary } from '../../lib/store';
import { CODE_COLORS } from '../table/ActionBar';

const STREET = ['Preflop', 'Flop', 'Turn', 'River'];

/** A mark as a coloured symbol tile. */
export function MarkIcon({ mark, size = 22 }: { mark: Mark; size?: number }) {
  const m = MARKS[mark];
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-mono font-bold text-ink-950"
      style={{ width: size, height: size, background: m.color, fontSize: size * 0.45 }}
    >
      {m.sym}
    </span>
  );
}

/**
 * End-of-hand review: the result, then one line per decision you made with a
 * chess-style mark. Hover (or tap) a line for what the solver would have done.
 */
export function HandReview({ h }: { h: HandSummary }) {
  const [open, setOpen] = useState<number | null>(null);
  const acc = h.grades.length ? accuracy(h.grades) : null;
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div className={`tabular font-mono text-[30px] font-bold leading-none ${h.net > 0 ? 'text-gold' : 'text-ink-100'}`}>{signedMoney(h.net)}</div>
        {acc !== null && (
          <div className="text-right">
            <div className="eyebrow">Accuracy</div>
            <div className="tabular mt-1 font-mono text-[20px] font-bold leading-none">{acc.toFixed(0)}</div>
          </div>
        )}
      </div>

      {h.grades.length === 0 ? (
        <div className="font-mono text-[10.5px] tracking-[0.08em] text-ink-500">NO DECISIONS THIS HAND</div>
      ) : (
        <ol className="flex flex-col border-t border-ink-700">
          {h.grades.map((g, i) => {
            const mark = markOf(g);
            const isOpen = open === i;
            return (
              <li key={i} className="border-b border-ink-700" onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  onFocus={() => setOpen(i)}
                  aria-expanded={isOpen}
                  className="grid min-h-[46px] w-full grid-cols-[22px_58px_minmax(0,1fr)_auto] items-center gap-3 text-left"
                >
                  <MarkIcon mark={mark} />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">{STREET[g.street]}</span>
                  <span className="truncate text-[14px]">{CODE_LABELS[g.code as Code]}</span>
                  <span className="text-[13px] font-bold" style={{ color: MARKS[mark].color }}>
                    {MARKS[mark].text}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="pb-3 pl-[34px]">
                        <div className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-400">THE SOLVER PLAYS</div>
                        <div className="flex h-2">
                          {g.codes.map((c, j) => (
                            <span key={c} style={{ width: `${g.probs[j] * 100}%`, background: CODE_COLORS[c as Code] }} />
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                          {g.codes
                            .map((c, j) => ({ c, p: g.probs[j] }))
                            .filter((x) => x.p >= 0.01)
                            .sort((a, b) => b.p - a.p)
                            .map((x) => (
                              <span key={x.c} className={x.c === g.code ? 'text-ink-100' : 'text-ink-400'}>
                                {CODE_LABELS[x.c as Code]} {pct(x.p)}
                                {x.c === g.code ? ' ← you' : ''}
                              </span>
                            ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
      )}

      <a href="#you" className="btn min-h-[44px] border border-ink-600 text-[14px] hover:border-ink-100">
        Your style →
      </a>
    </motion.div>
  );
}
