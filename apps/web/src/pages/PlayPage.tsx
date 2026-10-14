import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HandReview } from '../components/brain/HandReview';
import { ActionBar } from '../components/table/ActionBar';
import { Table } from '../components/table/Table';
import { Segmented, Toggle } from '../components/ui/Controls';
import { signedMoney } from '../lib/format';
import { usePlay } from '../lib/store';

function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export function PlayPage() {
  const wide = useWide();
  const phase = usePlay((s) => s.phase);
  const handNo = usePlay((s) => s.handNo);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const review = phase === 'over' && last && last.id === handNo ? last : null;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-3 sm:pt-5 lg:px-6">
      <TopBar />
      <div className={`mt-2 grid gap-6 sm:mt-3 ${review && wide ? 'grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="mx-auto flex w-full min-w-0 max-w-[1000px] flex-col gap-3">
          <Table />
          {wide ? (
            <div className="mx-auto w-full max-w-[600px]">
              <ActionBar />
            </div>
          ) : (
            <div className="sticky bottom-0 z-20 -mx-4 border-t border-ink-600 bg-ink-950 px-4 pt-2.5" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
              <ActionBar />
            </div>
          )}
        </div>
        <AnimatePresence>
          {review && (
            <motion.aside
              key={`review-${review.id}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="glass self-start p-4 lg:sticky lg:top-[70px]"
              aria-label="Hand review"
            >
              <HandReview h={review} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Session result on the left, settings on the right. */
function TopBar() {
  const history = usePlay((s) => s.history);
  const net = history.reduce((a, h) => a + h.net, 0);
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-2">
      <div className="font-mono text-[11px] tracking-[0.08em] text-ink-400">
        {history.length > 0 && (
          <>
            SESSION <span className={`tabular ml-1 text-[13px] font-bold ${net > 0 ? 'text-gold' : 'text-ink-100'}`}>{signedMoney(net)}</span>
            <span className="ml-2 hidden sm:inline">
              · {history.length} {history.length === 1 ? 'HAND' : 'HANDS'}
            </span>
          </>
        )}
      </div>
      <SettingsButton />
    </div>
  );
}

function SettingsButton() {
  const [open, setOpen] = useState(false);
  const settings = usePlay((s) => s.settings);
  const set = usePlay((s) => s.setSettings);
  const reset = usePlay((s) => s.resetSession);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="grid h-[38px] w-[38px] place-items-center border border-ink-600 text-ink-300 hover:border-ink-100 hover:text-ink-100" aria-label="Settings" aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              className="glass absolute right-0 top-11 z-50 w-[300px] p-4"
            >
              <Toggle checked={settings.lambda > 0} onChange={(v) => set({ lambda: v ? 1 : 0 })} label="Otto adapts to you" hint="Off: Otto plays balanced poker" />
              <Toggle checked={settings.riskBudget} onChange={(v) => set({ riskBudget: v })} label="Cautious adapting" hint="Adapts only as hard as its winnings allow" />
              <Toggle checked={settings.coach} onChange={(v) => set({ coach: v })} label="Coach" hint="Rate your decisions against the solver" />
              <Toggle checked={settings.showBotCards} onChange={(v) => set({ showBotCards: v })} label="Practice mode" hint="Show the AI's cards and odds during the hand" />
              <Toggle checked={settings.autoDeal} onChange={(v) => set({ autoDeal: v })} label="Auto-deal next hand" />
              <Toggle checked={settings.fourColor} onChange={(v) => set({ fourColor: v })} label="Four-colour deck" hint="Different colour for each suit" />
              <Toggle checked={settings.sound} onChange={(v) => set({ sound: v })} label="Sound effects" />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-ink-100">Bot speed</span>
                <Segmented
                  value={settings.speed}
                  onChange={(v) => set({ speed: v })}
                  options={[
                    { value: 'slow', label: 'Slow' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'fast', label: 'Fast' },
                  ]}
                />
              </div>
              <button
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className="btn mt-2 min-h-[40px] w-full border border-ink-600 text-sm text-ink-200 hover:border-ink-100"
              >
                Start a new session
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
