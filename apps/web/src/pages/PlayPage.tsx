import { STREET_NAMES } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HandReview } from '../components/brain/HandReview';
import { SeesYou } from '../components/brain/SeesYou';
import { ActionBar } from '../components/table/ActionBar';
import { Table } from '../components/table/Table';
import { Segmented, Toggle } from '../components/ui/Controls';
import { Welcome } from '../components/ui/Welcome';
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
  const [sees, setSees] = useState(false);
  const phase = usePlay((s) => s.phase);
  const handNo = usePlay((s) => s.handNo);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const review = phase === 'over' && last && last.id === handNo ? last : null;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-3 sm:pt-5 lg:px-6">
      <Welcome />
      <ModeBar onSees={() => setSees(true)} />
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
              <HandReview h={review} onSeeRead={() => setSees(true)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      <SeesYou open={sees} onClose={() => setSees(false)} />
    </div>
  );
}

/** Hand number and street on the left; balanced/adaptive switch and settings on the right. */
function ModeBar({ onSees }: { onSees: () => void }) {
  const lambda = usePlay((s) => s.settings.lambda);
  const setSettings = usePlay((s) => s.setSettings);
  const handNo = usePlay((s) => s.handNo);
  const state = usePlay((s) => s.state);
  const history = usePlay((s) => s.history);
  usePlay((s) => s.version);
  const adaptive = lambda > 0;
  const net = history.reduce((a, h) => a + h.net, 0) / 100;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex border border-ink-600 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
        <span className="px-2.5 py-1.5">
          <span className="hidden sm:inline">HAND </span>#<span className="text-ink-100">{String(handNo).padStart(3, '0')}</span>
        </span>
        {state && (
          <span className="border-l border-ink-600 px-2.5 py-1.5 uppercase text-ink-100">{state.terminal ? 'Done' : STREET_NAMES[state.street]}</span>
        )}
        <span className="hidden border-l border-ink-600 px-2.5 py-1.5 sm:inline">
          SESSION <span className={`tabular ${net > 0 ? 'text-gold' : 'text-ink-100'}`}>{net > 0 ? '+' : ''}{net.toFixed(net % 1 === 0 ? 0 : 1)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onSees} className="flex min-h-[38px] items-center gap-2 border border-ink-600 px-3 font-mono text-[11px] tracking-[0.08em] text-ink-100 hover:border-ink-100">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 6 C4 1 12 1 15 6 C12 11 4 11 1 6 Z" />
            <rect x="6.5" y="4.5" width="3" height="3" fill="currentColor" />
          </svg>
          <span className="hidden sm:inline">HOW NASH SEES YOU</span>
          <span className="sm:hidden">READ</span>
        </button>
        <div role="radiogroup" aria-label="AI mode" className="flex border border-ink-600 font-mono text-[11px] tracking-[0.08em]">
          {[
            { v: 0, label: 'BALANCED', short: 'BAL' },
            { v: 1, label: 'ADAPTIVE', short: 'ADAPT' },
          ].map((o) => {
            const on = o.v === 0 ? !adaptive : adaptive;
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => setSettings({ lambda: o.v })}
                aria-label={o.label}
                className={`min-h-[36px] px-3 transition ${on ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
              >
                <span className="hidden sm:inline">{o.label}</span>
                <span className="sm:hidden">{o.short}</span>
              </button>
            );
          })}
        </div>
        <SettingsButton />
      </div>
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
      <button onClick={() => setOpen((o) => !o)} className="btn h-9 w-9 rounded-xl bg-white/5 text-ink-300 ring-1 ring-white/10 hover:text-white" aria-label="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="glass absolute right-0 top-11 z-50 w-[320px] rounded-2xl p-4"
            >
              <div className="eyebrow mb-2">Settings</div>
              <div className="py-1.5">
                <div className="flex items-center justify-between text-sm text-ink-100">
                  Adaptation strength <span className="tabular font-mono text-xs text-ink-400">{Math.round(settings.lambda * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.lambda}
                  onChange={(e) => set({ lambda: Number(e.target.value) })}
                  className="slider slider-exploit mt-2 w-full"
                  style={{ ['--fill' as string]: `${settings.lambda * 100}%` }}
                  aria-label="Adaptation strength"
                />
              </div>
              <Toggle checked={settings.riskBudget} onChange={(v) => set({ riskBudget: v })} label="Cautious adapting" hint="Only adapt as hard as the AI's winnings allow" />
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
                className="btn mt-2 w-full bg-white/[0.04] py-2 text-sm text-ink-200 ring-1 ring-white/10 hover:bg-white/[0.08]"
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
