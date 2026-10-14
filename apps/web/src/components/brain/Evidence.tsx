import type { OpponentSnapshot } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { pct, signedMoney } from '../../lib/format';
import { HABIT } from '../../lib/otto';
import type { HandSummary } from '../../lib/store';

/**
 * Everything Otto has observed about you, behind a button: your full profile
 * (each habit, how often it came up, how often you did it, Otto's estimate) and
 * a hand-by-hand log of how each hand moved those estimates.
 */
export function Evidence({ snap, history }: { snap: OpponentSnapshot; history: HandSummary[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'profile' | 'hands'>('profile');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-mono text-[11px] tracking-[0.08em] text-ink-400 underline decoration-ink-600 underline-offset-4 hover:text-ink-100">
        SEE EVERYTHING OTTO KNOWS ABOUT YOU
      </button>
      <AnimatePresence>
        {open && (
          <motion.div data-modal-open className="fixed inset-0 z-50 flex justify-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="What Otto knows about you"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              exit={{ x: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-[600px] flex-col border-l border-ink-100 bg-ink-950"
            >
              <div className="flex items-center gap-3 border-b border-ink-600 px-5 py-3">
                <h2 className="text-[18px] font-extrabold">What Otto knows about you</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="ml-auto grid h-10 w-10 place-items-center border border-ink-600 hover:border-ink-100">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              </div>
              <div role="tablist" className="grid grid-cols-2 border-b border-ink-100 font-mono text-[11px] tracking-[0.08em]">
                {(['profile', 'hands'] as const).map((t, i) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`min-h-[42px] ${i ? 'border-l border-ink-600' : ''} ${tab === t ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
                  >
                    {t === 'profile' ? 'YOUR PROFILE' : 'HAND BY HAND'}
                  </button>
                ))}
              </div>
              <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{tab === 'profile' ? <Profile snap={snap} /> : <Hands history={history} />}</div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Profile({ snap }: { snap: OpponentSnapshot }) {
  const rows = snap.stats.filter((s) => HABIT[s.key]);
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-300">
        Otto only sees what anyone at the table would: the betting, and your cards when a hand reaches showdown. Each estimate starts at typical play and moves toward what you actually do as the situation keeps coming up.
      </p>
      <table className="mt-5 w-full text-left text-[13px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-500">
          <tr className="border-b border-ink-600">
            <th className="py-2 font-normal">How often you…</th>
            <th className="py-2 text-right font-normal">Seen</th>
            <th className="py-2 text-right font-normal">Did it</th>
            <th className="py-2 text-right font-normal">Estimate</th>
            <th className="py-2 text-right font-normal">Typical</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const off = s.lo > s.baseline || s.hi < s.baseline;
            return (
              <tr key={s.key} className={`border-b border-ink-700 ${s.opps ? '' : 'text-ink-500'}`}>
                <td className="py-2.5 pr-2">{HABIT[s.key]}</td>
                <td className="tabular py-2.5 text-right font-mono">{s.opps}</td>
                <td className="tabular py-2.5 text-right font-mono">{s.hits}</td>
                <td className={`tabular py-2.5 text-right font-mono ${off ? 'font-bold text-gold' : ''}`}>{pct(s.mean)}</td>
                <td className="tabular py-2.5 text-right font-mono text-ink-400">{pct(s.baseline)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-ink-500">
        SEEN = TIMES THE SITUATION CAME UP · ORANGE = OTTO IS CONFIDENT YOU DIFFER FROM TYPICAL PLAY
      </p>
    </div>
  );
}

function Hands({ history }: { history: HandSummary[] }) {
  if (history.length === 0) return <p className="text-[14px] text-ink-400">No hands yet.</p>;
  return (
    <ol className="flex flex-col gap-5">
      {[...history].reverse().map((h) => (
        <li key={h.id}>
          <div className="flex items-baseline justify-between border-b border-ink-600 pb-1.5">
            <span className="font-mono text-[11px] tracking-[0.08em] text-ink-400">HAND {h.id}</span>
            <span className={`tabular font-mono text-[12px] ${h.net > 0 ? 'text-gold' : 'text-ink-300'}`}>{signedMoney(h.net)}</span>
          </div>
          {(h.observed ?? []).length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-500">Nothing new — the hand ended before any tracked situation came up.</p>
          ) : (
            <ul className="mt-1">
              {h.observed.map((o) => {
                const moved = o.after - o.before;
                return (
                  <li key={o.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-1.5 text-[13px]">
                    <span>
                      {HABIT[o.key]} <span className="text-ink-500">· {o.opps > 1 ? `${o.hits} of ${o.opps}` : o.hits ? 'yes' : 'no'}</span>
                    </span>
                    <span className="tabular font-mono text-[12px] text-ink-400">
                      {pct(o.before)} → <span className={Math.abs(moved) >= 0.01 ? 'text-ink-100' : ''}>{pct(o.after)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
