import { CODE_LABELS, STREET_NAMES, accuracy } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { describeAction, pct, signed } from '../../lib/format';
import { type HandSummary, HUMAN, usePlay } from '../../lib/store';
import { LineChart } from '../charts/LineChart';
import { MiniCard } from '../table/PlayingCard';

export function SessionTab() {
  const history = usePlay((s) => s.history);
  const grades = usePlay((s) => s.allGrades);
  const coach = usePlay((s) => s.settings.coach);
  let cum = 0;
  const pts: Array<[number, number]> = [[0, 0]];
  for (const h of history) {
    cum += h.net / 100;
    pts.push([h.id, +cum.toFixed(2)]);
  }
  const n = history.length;
  const bb100 = n ? (cum / n) * 100 : 0;
  const counts = { Best: 0, Good: 0, Inaccuracy: 0, Mistake: 0, Blunder: 0 } as Record<string, number>;
  for (const g of grades) counts[g.label]++;
  const acc = accuracy(grades);
  const won = history.filter((h) => h.net > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Your result" value={`${signed(cum)} bb`} tone={cum > 0 ? 'win' : cum < 0 ? 'loss' : undefined} />
        <Tile label="Win rate" value={`${signed(bb100, 0)}`} sub="bb / 100 hands" tone={bb100 > 0 ? 'win' : bb100 < 0 ? 'loss' : undefined} />
        <Tile label="Hands" value={`${n}`} sub={n ? `${pct(won / n)} won` : undefined} />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Your cumulative result (bb)</div>
        <LineChart series={[{ name: 'You', color: 'var(--color-gold)', points: pts }]} height={170} xLabel="hand" formatY={(v) => v.toFixed(0)} empty="Play a hand to start the graph" />
        <p className="mt-1 text-[11px] text-ink-500">
          Heads-up poker is high-variance: even a big edge needs hundreds of hands to show. The Arena tab runs thousands in seconds.
        </p>
      </div>
      {coach && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Coach — GTO accuracy</div>
            <div className="text-xs text-ink-400">{grades.length} decisions graded</div>
          </div>
          <div className="flex items-center gap-4">
            <AccuracyRing value={acc} />
            <div className="grid flex-1 grid-cols-1 gap-1 text-[12px]">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-ink-300">{k}</span>
                  <span className="tabular font-mono text-ink-100">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <HistoryList history={history} />
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'win' | 'loss' }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/5">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`tabular font-display text-lg font-semibold ${tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-ink-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-500">{sub}</div>}
    </div>
  );
}

function AccuracyRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? 'var(--color-win)' : value >= 60 ? 'var(--color-gold)' : 'var(--color-loss)';
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(148,161,184,0.12)" strokeWidth="7" />
        <motion.circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="tabular font-display text-xl font-bold">{value.toFixed(0)}</div>
          <div className="-mt-1 text-[9px] uppercase tracking-wider text-ink-400">accuracy</div>
        </div>
      </div>
    </div>
  );
}

function HistoryList({ history }: { history: HandSummary[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (history.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Hand history</div>
      <div className="flex flex-col gap-1">
        {history
          .slice()
          .reverse()
          .slice(0, 60)
          .map((h) => (
            <div key={h.id} className="rounded-lg bg-white/[0.02] ring-1 ring-white/5">
              <button onClick={() => setOpen(open === h.id ? null : h.id)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]">
                <span className="w-8 font-mono text-ink-500">#{h.id}</span>
                <span className="flex gap-0.5">
                  <MiniCard card={h.humanHole[0]} />
                  <MiniCard card={h.humanHole[1]} />
                </span>
                <span className="text-ink-500">vs</span>
                <span className="flex gap-0.5">
                  {h.showdown ? (
                    <>
                      <MiniCard card={h.botHole[0]} />
                      <MiniCard card={h.botHole[1]} />
                    </>
                  ) : (
                    <span className="text-ink-500">??</span>
                  )}
                </span>
                <span className={`tabular ml-auto font-mono ${h.net > 0 ? 'text-win' : h.net < 0 ? 'text-loss' : 'text-ink-400'}`}>{signed(h.net / 100)}</span>
              </button>
              <AnimatePresence>
                {open === h.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <HandDetail h={h} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
      </div>
    </div>
  );
}

function HandDetail({ h }: { h: HandSummary }) {
  let gi = 0;
  return (
    <div className="flex flex-col gap-1 border-t border-white/5 px-2.5 py-2 text-[11.5px]">
      <div className="flex items-center gap-1.5 text-ink-400">
        Board:
        {h.board.length ? h.board.map((c) => <MiniCard key={c} card={c} />) : <span>—</span>}
        <span className="ml-auto">{h.humanButton ? 'You: button' : 'You: big blind'}</span>
      </div>
      {[0, 1, 2, 3].map((st) => {
        const recs = h.log.filter((r) => r.street === st);
        if (!recs.length) return null;
        let bets = 0;
        return (
          <div key={st} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="w-12 text-[10px] uppercase tracking-wider text-ink-500">{STREET_NAMES[st]}</span>
            {recs.map((r, i) => {
              const isBet = r.kind === 'raise' && bets++ === 0 && st > 0;
              const g = r.player === HUMAN && h.grades.length ? h.grades[gi++] : undefined;
              return (
                <span key={i} className={r.player === HUMAN ? 'text-amber-200' : 'text-ink-200'}>
                  {r.player === HUMAN ? 'You' : 'Bot'} {describeAction(r, isBet)}
                  {g && (
                    <span className={`ml-1 text-[10px] ${g.label === 'Best' || g.label === 'Good' ? 'text-win' : 'text-loss'}`} title={`GTO preferred ${CODE_LABELS[g.bestCode]}`}>
                      ({g.label})
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
      {h.showdown && (
        <div className="text-ink-400">
          Showdown: you {h.humanHand}, bot {h.botHand}
        </div>
      )}
    </div>
  );
}
