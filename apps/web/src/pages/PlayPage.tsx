import { describeHand, evaluate } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
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

export function PlayPage() {
  const [tab, setTab] = useState<Tab>('brain');
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-10 pt-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-6">
      <Welcome />
      <div className="flex min-w-0 flex-col gap-4">
        <ModeBar />
        <Table />
        <CoachStrip />
        <ActionBar />
      </div>
      <aside className="glass flex min-h-[560px] flex-col rounded-2xl lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)]">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 p-3">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'brain', label: "AI's thinking" },
              { value: 'read', label: 'Your profile' },
              { value: 'session', label: 'Results' },
            ]}
          />
          <SettingsButton />
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              {tab === 'brain' ? <BrainTab /> : tab === 'read' ? <ReadTab /> : <SessionTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}

/** The headline control: balanced (GTO) vs adaptive (exploiting) opponent. */
function ModeBar() {
  const lambda = usePlay((s) => s.settings.lambda);
  const setSettings = usePlay((s) => s.setSettings);
  const adaptive = lambda > 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="min-w-0">
        <div className="font-display text-[26px] font-semibold leading-none text-ink-100">Heads-up No-Limit Hold'em</div>
        <div className="mt-1.5 text-[12.5px] text-ink-400">
          {adaptive
            ? 'Adaptive AI: starts balanced, then learns your habits and punishes them.'
            : 'Balanced AI: plays the equilibrium strategy and never adjusts to you.'}
        </div>
      </div>
      <div role="radiogroup" aria-label="AI mode" className="inline-flex rounded-full bg-black/40 p-1 ring-1 ring-gold/20">
        {[
          { v: 0, label: 'Balanced', dot: 'bg-gto' },
          { v: 1, label: 'Adaptive', dot: 'bg-exploit' },
        ].map((o) => {
          const on = o.v === 0 ? !adaptive : adaptive;
          return (
            <button
              key={o.label}
              role="radio"
              aria-checked={on}
              onClick={() => setSettings({ lambda: o.v })}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${on ? 'bg-gold/15 text-gold-hi ring-1 ring-gold/40' : 'text-ink-400 hover:text-ink-200'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />
              {o.label}
            </button>
          );
        })}
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
  const handName = state.board.length >= 3 ? describeHand(evaluate([a, b, ...state.board])) : a >> 2 === b >> 2 ? 'Pocket pair' : (a & 3) === (b & 3) ? 'Suited cards' : 'Unpaired cards';
  const myTurn = phase === 'human';
  const st = equity !== null ? strengthLabel(equity) : null;
  const hintTop = hint
    ? hint.codes
        .map((c, i) => ({ c, p: hint.probs[i] }))
        .filter((x) => x.p >= 0.12)
        .sort((x, y) => y.p - x.p)
    : [];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-[13px]">
      <span className="text-ink-400">
        Your hand <span className="ml-1 font-semibold text-ink-100">{handName}</span>
      </span>
      {st && (
        <span className="flex items-center gap-2 text-ink-400" title={`Win chance against a random hand: ${pct(equity!)}`}>
          Strength
          <span className="flex gap-[3px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i <= st.n ? 'bg-gold' : 'bg-white/10'}`} />
            ))}
          </span>
          <span className="font-semibold text-ink-100">{st.word}</span>
        </span>
      )}
      {myTurn && !hint && (
        <button onClick={requestHint} className="rounded-full px-3 py-1 text-[12px] font-semibold text-gold-hi ring-1 ring-gold/30 hover:bg-gold/10">
          Ask the solver
        </button>
      )}
      {hint && myTurn && (
        <span className="flex flex-wrap items-center gap-1.5 text-ink-300">
          Solver suggests
          {hintTop.map((x, i) => (
            <span key={x.c} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-500">{i === hintTop.length - 1 ? 'or sometimes' : ','}</span>}
              <span className="rounded-full bg-gold/10 px-2.5 py-0.5 font-semibold text-gold-hi ring-1 ring-gold/25" style={{ opacity: 0.6 + 0.4 * x.p }}>
                {VERB[x.c]}
              </span>
            </span>
          ))}
        </span>
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
