import { type StatKey, matchArchetypes } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { pct } from '../../lib/format';
import { findLeaks } from '../../lib/leaks';
import { HABIT, NASH, nashify } from '../../lib/nash';
import { usePlay } from '../../lib/store';
import { NashFace } from '../table/Nash';
import { ARCHETYPE_BLURB } from './ReadTab';
import { SessionTab } from './SessionTab';

/** The habits shown, in a natural order: preflop first, then after the flop. */
const KEYS: StatKey[] = ['vpip', 'pfr', 'threeBet', 'foldTo3bet', 'cbet', 'foldToCbet', 'postBet', 'foldToBet', 'raiseVsBet', 'foldRiver', 'wtsd'];

/** A drawer that explains, in plain language, what Nash believes about you and what it does about it. */
export function SeesYou({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'read' | 'session'>('read');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div data-modal-open className="fixed inset-0 z-50 flex justify-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`How ${NASH} sees you`}
            initial={{ x: 40 }}
            animate={{ x: 0 }}
            exit={{ x: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-[560px] flex-col border-l border-ink-100 bg-ink-950"
          >
            <div className="flex items-center gap-3 border-b border-ink-600 px-5 py-3">
              <NashFace mood="reading" size={36} />
              <h2 className="text-[18px] font-extrabold">How {NASH} sees you</h2>
              <button onClick={onClose} aria-label="Close" className="ml-auto grid h-10 w-10 place-items-center border border-ink-600 hover:border-ink-100">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>
            <div role="tablist" aria-label="View" className="grid grid-cols-2 border-b border-ink-100 font-mono text-[11px] tracking-[0.08em]">
              {(['read', 'session'] as const).map((t, i) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`min-h-[42px] ${i ? 'border-l border-ink-600' : ''} ${tab === t ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
                >
                  {t === 'read' ? 'ITS READ ON YOU' : 'YOUR SESSION'}
                </button>
              ))}
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{tab === 'read' ? <Read /> : <SessionTab />}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Read() {
  const bot = usePlay((s) => s.bot);
  const models = usePlay((s) => s.models);
  usePlay((s) => s.history.length);
  if (!bot || !models) return null;
  const snap = bot.model.snapshot();
  const top = matchArchetypes(bot.model, models.exploit.signatures)[0];
  const leaks = new Map(findLeaks(snap).map((l) => [l.key, l]));
  const confidence = snap.hands < 12 ? 'first impression' : snap.hands < 60 ? 'getting clearer' : 'confident';
  const blurb = ARCHETYPE_BLURB[top.id] ?? '';
  const [what, response] = blurb.split('. ');
  const all = KEYS.map((k) => snap.stats.find((s) => s.key === k)!);
  const rows = all.filter((s) => s.opps >= 3).sort((a, b) => Number(leaks.has(b.key)) - Number(leaks.has(a.key)));
  const unseen = all.length - rows.length;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="eyebrow">{NASH} thinks you play like a</div>
        <div className="mt-1.5 text-[34px] font-extrabold leading-none text-gold">{snap.hands < 5 ? '…' : top.name}</div>
        {snap.hands >= 5 && (
          <p className="mt-3 text-[15px] leading-snug text-ink-200">
            {nashify(what.replace(/\.$/, ''))}. <span className="text-ink-400">{response ? nashify(response) : ''}</span>
          </p>
        )}
        <div className="mt-4 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
          <span className="h-[2px] flex-1 bg-ink-600">
            <span className="block h-full bg-gold" style={{ width: `${Math.min(100, (snap.hands / 60) * 100)}%` }} />
          </span>
          {snap.hands} hands · {confidence}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <div className="eyebrow">How often you…</div>
          <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.06em] text-ink-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-gold" /> YOU
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-px bg-ink-100" /> TYPICAL
            </span>
          </div>
        </div>
        <div className="flex flex-col border border-ink-600">
          {rows.map((s, i) => {
            const leak = leaks.get(s.key);
            return (
              <div key={s.key} className={`px-3.5 py-3 ${i ? 'border-t border-ink-700' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-ink-100">{HABIT[s.key]}</span>
                  <span className="tabular font-mono text-[11.5px]">
                    <span className={leak ? 'text-gold' : 'text-ink-100'}>{pct(s.mean)}</span>
                    <span className="text-ink-500"> / {pct(s.baseline)}</span>
                  </span>
                </div>
                <div className="relative mt-2 h-3" aria-hidden="true">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-ink-600" />
                  <span className="absolute top-1/2 h-[5px] -translate-y-1/2 bg-ink-600" style={{ left: `${s.lo * 100}%`, width: `${Math.max(0.5, (s.hi - s.lo) * 100)}%` }} />
                  <span className="absolute inset-y-0 w-px bg-ink-100" style={{ left: `${s.baseline * 100}%` }} />
                  <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 ${leak ? 'bg-gold' : 'bg-ink-300'}`} style={{ left: `${s.mean * 100}%` }} />
                </div>
                {leak && <p className="mt-2 border-l-2 border-gold pl-2.5 text-[13px] leading-snug text-ink-300">{nashify(leak.advice)}</p>}
              </div>
            );
          })}
          {unseen > 0 && (
            <div className={`px-3.5 py-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-500 ${rows.length ? 'border-t border-ink-700' : ''}`}>
              {unseen === all.length ? `Play a few hands — ${NASH} hasn't seen enough yet` : `+ ${unseen} more ${unseen === 1 ? 'habit' : 'habits'} once ${NASH} has seen them`}
            </div>
          )}
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-ink-500">GREY BAND = HOW SURE NASH IS · ORANGE = A HABIT IT IS USING AGAINST YOU</p>
      </section>
    </div>
  );
}
