import { STREET_NAMES, describeHand, evaluate } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BrainTab } from '../components/brain/BrainTab';
import { ReadTab } from '../components/brain/ReadTab';
import { SessionTab } from '../components/brain/SessionTab';
import { ActionBar } from '../components/table/ActionBar';
import { Table } from '../components/table/Table';
import { Segmented, Toggle } from '../components/ui/Controls';
import { Welcome } from '../components/ui/Welcome';
import { pct } from '../lib/format';
import { HUMAN, usePlay } from '../lib/store';

type Tab = 'brain' | 'read' | 'session';

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
  const [tab, setTab] = useState<Tab>('brain');
  const wide = useWide();
  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-10 pt-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6">
      <Welcome />
      <div className="flex min-w-0 flex-col gap-3">
        <ModeBar />
        <Table />
        <CoachStrip />
        {!wide && (
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-ink-600 bg-ink-950 px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <ActionBar />
          </div>
        )}
      </div>
      <aside className="glass flex min-h-[520px] flex-col lg:sticky lg:top-[70px] lg:max-h-[calc(100vh-90px)]">
        <div role="tablist" aria-label="Panel" className="grid grid-cols-3 border-b border-ink-100 font-mono text-[11px] tracking-[0.08em]">
          {(
            [
              { value: 'brain', label: 'AI' },
              { value: 'read', label: 'YOU' },
              { value: 'session', label: 'RESULTS' },
            ] as Array<{ value: Tab; label: string }>
          ).map((o, i) => (
            <button
              key={o.value}
              role="tab"
              aria-selected={tab === o.value}
              onClick={() => setTab(o.value)}
              className={`min-h-[42px] ${i > 0 ? 'border-l border-ink-600' : ''} ${tab === o.value ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              {tab === 'brain' ? <BrainTab /> : tab === 'read' ? <ReadTab /> : <SessionTab />}
            </motion.div>
          </AnimatePresence>
        </div>
        {wide && (
          <div className="border-t border-ink-600 p-3.5">
            <ActionBar />
          </div>
        )}
      </aside>
    </div>
  );
}

/** Hand number and street on the left; balanced/adaptive switch and settings on the right. */
function ModeBar() {
  const lambda = usePlay((s) => s.settings.lambda);
  const setSettings = usePlay((s) => s.setSettings);
  const handNo = usePlay((s) => s.handNo);
  const state = usePlay((s) => s.state);
  const history = usePlay((s) => s.history);
  usePlay((s) => s.version);
  const adaptive = lambda > 0;
  const net = history.reduce((a, h) => a + h.net, 0) / 100;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex border border-ink-600 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
        <span className="px-2.5 py-1.5">
          HAND <span className="text-ink-100">{String(handNo).padStart(3, '0')}</span>
        </span>
        {state && (
          <span className="border-l border-ink-600 px-2.5 py-1.5 uppercase text-ink-100">{state.terminal ? 'Done' : STREET_NAMES[state.street]}</span>
        )}
        <span className="border-l border-ink-600 px-2.5 py-1.5">
          SESSION <span className={`tabular ${net > 0 ? 'text-gold' : 'text-ink-100'}`}>{net > 0 ? '+' : ''}{net.toFixed(net % 1 === 0 ? 0 : 1)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="AI mode" className="flex border border-ink-600 font-mono text-[11px] tracking-[0.08em]">
          {[
            { v: 0, label: 'BALANCED' },
            { v: 1, label: 'ADAPTIVE' },
          ].map((o) => {
            const on = o.v === 0 ? !adaptive : adaptive;
            return (
              <button
                key={o.label}
                role="radio"
                aria-checked={on}
                onClick={() => setSettings({ lambda: o.v })}
                className={`min-h-[36px] px-3 transition ${on ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <SettingsButton />
      </div>
    </div>
  );
}

function strengthLabel(e: number) {
  if (e >= 0.8) return { word: 'Very strong', n: 5 };
  if (e >= 0.65) return { word: 'Strong', n: 4 };
  if (e >= 0.5) return { word: 'Decent', n: 3 };
  if (e >= 0.35) return { word: 'Weak', n: 2 };
  return { word: 'Very weak', n: 1 };
}

const VERB: Record<string, string> = { f: 'Fold', k: 'Check', c: 'Call', t: 'Bet small', h: 'Bet half pot', p: 'Bet pot', a: 'All-in' };

function CoachStrip() {
  const state = usePlay((s) => s.state);
  usePlay((s) => s.version);
  const phase = usePlay((s) => s.phase);
  const coach = usePlay((s) => s.settings.coach);
  const equity = usePlay((s) => s.humanEquity);
  const hint = usePlay((s) => s.hint);
  const requestHint = usePlay((s) => s.requestHint);
  if (!coach || !state) return null;
  const [a, b] = state.holes(HUMAN);
  const handName = state.board.length >= 3 ? describeHand(evaluate([a, b, ...state.board])) : a >> 2 === b >> 2 ? 'Pocket pair' : (a & 3) === (b & 3) ? 'Suited' : 'Offsuit';
  const myTurn = phase === 'human';
  const st = equity !== null ? strengthLabel(equity) : null;
  const hintTop = hint
    ? hint.codes
        .map((c, i) => ({ c, p: hint.probs[i] }))
        .filter((x) => x.p >= 0.12)
        .sort((x, y) => y.p - x.p)
    : [];
  return (
    <div className="flex min-h-[36px] flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11.5px] tracking-[0.06em] text-ink-400">
      <span className="uppercase text-ink-100 sm:hidden">{handName}</span>
      {st && (
        <span className="flex items-center gap-2" title={`Win chance against a random hand: ${pct(equity!)}`}>
          STRENGTH
          <span className="flex border border-ink-500" aria-label={`${st.n} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`h-2 w-3.5 ${i > 1 ? 'border-l border-ink-950' : ''} ${i <= st.n ? 'bg-ink-100' : ''}`} />
            ))}
          </span>
        </span>
      )}
      {hint && myTurn && (
        <span className="flex flex-wrap items-center gap-3">
          <span>SOLVER</span>
          {hintTop.map((x) => (
            <span key={x.c} className="uppercase text-gold">
              {VERB[x.c]} <span className="tabular text-ink-300">{pct(x.p)}</span>
            </span>
          ))}
        </span>
      )}
      {myTurn && !hint && (
        <button onClick={requestHint} className="ml-auto min-h-[34px] border border-dashed border-ink-500 px-3 text-ink-100 hover:border-ink-100">
          HINT <span className="kbd">H</span>
        </button>
      )}
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
