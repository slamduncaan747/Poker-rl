import { CODE_LABELS, type Code, accuracy } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { pct } from '../../lib/format';
import { MARKS, type Mark, NASH, markOf } from '../../lib/nash';
import { type HandSummary } from '../../lib/store';
import { CODE_COLORS } from '../table/ActionBar';

const STREET = ['Preflop', 'Flop', 'Turn', 'River'];

function Badge({ mark }: { mark: Mark }) {
  const m = MARKS[mark];
  const cls =
    mark === 'Brilliant'
      ? 'bg-gold text-ink-950'
      : mark === 'Best'
        ? 'bg-ink-100 text-ink-950'
        : m.good
          ? 'border border-ink-100 text-ink-100'
          : 'border border-dashed border-gold text-gold';
  return (
    <span className={`inline-flex min-w-[96px] items-center gap-1.5 px-1.5 font-mono text-[10px] font-bold uppercase leading-[20px] tracking-[0.06em] ${cls}`}>
      <span className="w-4 text-center">{m.sym}</span>
      {m.text}
    </span>
  );
}

/**
 * End-of-hand review: the result, then one line per decision you made with a
 * chess-style mark. Hover (or tap) a line for what the solver would have done.
 */
export function HandReview({ h, onSeeRead }: { h: HandSummary; onSeeRead?: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const won = h.net > 0;
  const amt = Math.abs(h.net) / 100;
  const acc = h.grades.length ? accuracy(h.grades) : null;
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 border border-ink-100">
        <div className="px-3.5 py-3">
          <div className="eyebrow">Hand {String(h.id).padStart(3, '0')}</div>
          <div className={`tabular mt-1 font-mono text-[28px] font-bold leading-none ${won ? 'text-gold' : 'text-ink-100'}`}>
            {h.winner === 'split' ? '±0' : `${won ? '+' : '−'}${amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(1)}`}
          </div>
        </div>
        <div className="border-l border-ink-600 px-3.5 py-3">
          <div className="eyebrow">Accuracy</div>
          <div className="tabular mt-1 font-mono text-[28px] font-bold leading-none">{acc === null ? '—' : acc.toFixed(0)}</div>
        </div>
      </div>

      {h.grades.length === 0 ? (
        <div className="border border-dashed border-ink-600 px-3 py-3 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">NO DECISIONS THIS HAND</div>
      ) : (
        <ol className="flex flex-col border border-ink-600">
          {h.grades.map((g, i) => {
            const mark = markOf(g);
            const isOpen = open === i;
            return (
              <li key={i} className={i > 0 ? 'border-t border-ink-700' : ''} onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  onFocus={() => setOpen(i)}
                  aria-expanded={isOpen}
                  className={`grid min-h-[44px] w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 px-3 text-left ${isOpen ? 'bg-ink-800' : ''}`}
                >
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">{STREET[g.street]}</span>
                  <span className="truncate text-[14px]">{CODE_LABELS[g.code as Code]}</span>
                  <Badge mark={mark} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-3 pb-3">
                        <div className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-400">THE SOLVER PLAYS</div>
                        <div className="flex h-2.5">
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

      {h.showdown && (
        <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
          You · {h.humanHand}
          <br />
          {NASH} · {h.botHand}
        </div>
      )}

      {onSeeRead && (
        <button onClick={onSeeRead} className="btn min-h-[44px] border border-ink-600 text-[14px] hover:border-ink-100">
          How {NASH} sees you →
        </button>
      )}
    </motion.div>
  );
}
