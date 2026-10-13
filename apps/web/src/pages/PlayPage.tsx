import { CODE_LABELS, describeHand, evaluate } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { BrainTab } from '../components/brain/BrainTab';
import { ReadTab } from '../components/brain/ReadTab';
import { SessionTab } from '../components/brain/SessionTab';
import { ActionBar, CODE_COLORS } from '../components/table/ActionBar';
import { Table } from '../components/table/Table';
import { Segmented, Toggle } from '../components/ui/Controls';
import { Welcome } from '../components/ui/Welcome';
import { pct } from '../lib/format';
import { HUMAN, usePlay } from '../lib/store';

type Tab = 'brain' | 'read' | 'session';

export function PlayPage() {
  const [tab, setTab] = useState<Tab>('brain');
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-6">
      <Welcome />
      <div className="flex min-w-0 flex-col gap-4">
        <ExploitDial />
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
              { value: 'brain', label: 'AI X-Ray' },
              { value: 'read', label: 'Read on You' },
              { value: 'session', label: 'Session' },
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

/** The headline control: how hard the bot exploits you. */
function ExploitDial() {
  const lambda = usePlay((s) => s.settings.lambda);
  const setSettings = usePlay((s) => s.setSettings);
  const hands = usePlay((s) => s.history.length);
  const mode = lambda === 0 ? 'Pure GTO — unexploitable equilibrium play' : lambda < 0.5 ? 'Cautious exploitation' : lambda < 1 ? 'Balanced exploitation' : 'Full exploitation — maximise EV vs your leaks';
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Bot strategy</div>
        <div className="text-sm text-ink-100">{mode}</div>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <span className="text-xs font-semibold text-gto-hi">GTO</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={lambda}
          onChange={(e) => setSettings({ lambda: Number(e.target.value) })}
          className="slider slider-exploit flex-1"
          style={{ ['--fill' as string]: `${lambda * 100}%` }}
          aria-label="Exploitation strength"
        />
        <span className="text-xs font-semibold text-exploit-hi">Exploit</span>
        <span className="tabular w-10 text-right font-mono text-xs text-ink-300">λ {lambda.toFixed(2)}</span>
      </div>
      <div className="hidden text-right text-[11px] text-ink-400 xl:block">Hand #{hands + 1}</div>
    </div>
  );
}

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
  const handName = state.board.length >= 3 ? describeHand(evaluate([a, b, ...state.board])) : a >> 2 === b >> 2 ? 'Pocket pair' : 'Preflop';
  const myTurn = phase === 'human';
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px]">
      <span className="rounded-md bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 ring-1 ring-amber-300/20">Coach</span>
      <span className="text-ink-300">
        Hand: <span className="font-semibold text-ink-100">{handName}</span>
      </span>
      {equity !== null && (
        <span className="text-ink-300">
          Equity vs random hand: <span className="tabular font-mono font-semibold text-ink-100">{pct(equity)}</span>
        </span>
      )}
      {myTurn && !hint && (
        <button onClick={requestHint} className="rounded-md bg-white/5 px-2 py-0.5 text-ink-200 ring-1 ring-white/10 hover:bg-white/10">
          Ask the solver
        </button>
      )}
      {hint && myTurn && (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-400">Solver mix:</span>
          {hint.codes.map((c, i) =>
            hint.probs[i] > 0.01 ? (
              <span key={c} className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-white/5">
                <span className="h-2 w-2 rounded-sm" style={{ background: CODE_COLORS[c] }} />
                {CODE_LABELS[c]} <span className="tabular font-mono text-ink-100">{pct(hint.probs[i])}</span>
              </span>
            ) : null,
          )}
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
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Settings</div>
              <Toggle checked={settings.riskBudget} onChange={(v) => set({ riskBudget: v })} label="Safe exploitation" hint="Scale exploitation by the bot's winnings (risk budget)" />
              <Toggle checked={settings.coach} onChange={(v) => set({ coach: v })} label="Coach mode" hint="Grade your decisions against the GTO blueprint" />
              <Toggle checked={settings.showBotCards} onChange={(v) => set({ showBotCards: v })} label="Show bot's cards" hint="X-ray vision (for learning)" />
              <Toggle checked={settings.autoDeal} onChange={(v) => set({ autoDeal: v })} label="Auto-deal next hand" />
              <Toggle checked={settings.fourColor} onChange={(v) => set({ fourColor: v })} label="Four-colour deck" />
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
                className="btn mt-2 w-full bg-rose-500/15 py-2 text-sm text-rose-300 ring-1 ring-rose-400/20 hover:bg-rose-500/25"
              >
                Reset session &amp; bot's read
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
