import { STREET_NAMES, accuracy } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { type HandSummary } from '../../lib/store';

const MARK: Record<string, { mark: string; strong?: boolean; good: boolean }> = {
  Best: { mark: 'BEST', strong: true, good: true },
  Good: { mark: 'GOOD', good: true },
  Inaccuracy: { mark: '?!', good: false },
  Mistake: { mark: '?', good: false },
  Blunder: { mark: '??', good: false },
};

const SHORT = ['PRE', 'FLOP', 'TURN', 'RIVER'];

const VERB: Record<string, string> = { f: 'Fold', k: 'Check', c: 'Call', t: 'Bet ⅓', h: 'Bet ½', p: 'Bet pot', a: 'All-in' };

/** End-of-hand summary: result, accuracy, a grade per decision and the one moment worth a second look. */
export function HandReview({ h }: { h: HandSummary }) {
  const won = h.net > 0;
  const amt = Math.abs(h.net) / 100;
  const acc = h.grades.length ? accuracy(h.grades) : null;
  const worst = h.grades.reduce<(typeof h.grades)[number] | null>((w, g) => (!w || g.score < w.score ? g : w), null);
  const key = worst && !MARK[worst.label].good ? worst : null;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
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

      {h.grades.length > 0 && (
        <ol className="flex flex-col border border-ink-600 font-mono text-[12px]">
          {h.grades.map((g, i) => {
            const m = MARK[g.label];
            return (
              <li key={i} className={`grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 ${i > 0 ? 'border-t border-ink-700' : ''}`}>
                <span className="text-ink-400">{SHORT[g.street]}</span>
                <span className="truncate">{VERB[g.code] ?? g.code}</span>
                <span
                  className={`px-1.5 text-[9.5px] font-bold leading-[18px] ${
                    m.strong ? 'bg-ink-100 text-ink-950' : m.good ? 'border border-ink-100' : 'border border-dashed border-gold text-gold'
                  }`}
                >
                  {m.mark}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {key ? (
        <div className="border-l-2 border-gold pl-3">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-gold">{STREET_NAMES[key.street]} · key moment</div>
          <p className="mt-1 text-[15px] leading-snug">
            You chose <b>{(VERB[key.code] ?? key.code).toLowerCase()}</b>; the solver prefers <b>{(VERB[key.bestCode] ?? key.bestCode).toLowerCase()}</b>.
          </p>
        </div>
      ) : (
        h.grades.length > 0 && <div className="font-mono text-[10.5px] tracking-[0.08em] text-ink-400">CLEAN HAND · NO MISTAKES</div>
      )}

      {h.showdown && (
        <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
          {h.humanHand} <span className="text-ink-600">vs</span> {h.botHand}
        </div>
      )}
    </motion.div>
  );
}
