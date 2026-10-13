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
      <div className="grid grid-cols-3 border border-ink-600">
        <Tile label="Result" value={signed(cum, cum % 1 === 0 ? 0 : 1)} sub="BB" tone={cum > 0 ? 'win' : undefined} />
        <Tile label="Rate" value={n >= 10 ? signed(bb100, 0) : '—'} sub={n >= 10 ? 'BB/100' : 'AFTER 10'} tone={n >= 10 && bb100 > 0 ? 'win' : undefined} border />
        <Tile label="Hands" value={`${n}`} sub={n ? `${pct(won / n)} WON` : undefined} border />
      </div>
      <div>
        <div className="eyebrow mb-1.5">Big blinds over time</div>
        <LineChart series={[{ name: 'You', color: 'var(--color-gold)', points: pts }]} height={160} xLabel="hand" formatY={(v) => v.toFixed(0)} empty="Play a hand" />
      </div>
      {coach && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="eyebrow">Accuracy</div>
            <div className="font-mono text-[10.5px] tracking-[0.06em] text-ink-400">{grades.length} GRADED</div>
          </div>
          <div className="flex items-center gap-4">
            <AccuracyRing value={acc} />
            <div className="grid flex-1 grid-cols-1 gap-1 font-mono text-[11px]">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="uppercase text-ink-400">{k}</span>
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

function Tile({ label, value, sub, tone, border }: { label: string; value: string; sub?: string; tone?: 'win'; border?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${border ? 'border-l border-ink-600' : ''}`}>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">{label}</div>
      <div className={`tabular mt-0.5 font-mono text-[20px] font-bold leading-tight ${tone === 'win' ? 'text-gold' : 'text-ink-100'}`}>{value}</div>
      {sub && <div className="font-mono text-[9.5px] tracking-[0.06em] text-ink-500">{sub}</div>}
    </div>
  );
}

function AccuracyRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? 'var(--color-ink-100)' : 'var(--color-gold)';
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#2a2e33" strokeWidth="5" />
        <motion.circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="tabular font-mono text-xl font-bold">{value.toFixed(0)}</div>
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
      <div className="eyebrow mb-2">Hands</div>
      <div className="flex flex-col border border-ink-600">
        {history
          .slice()
          .reverse()
          .slice(0, 60)
          .map((h) => (
            <div key={h.id} className="border-b border-ink-700 last:border-b-0">
              <button onClick={() => setOpen(open === h.id ? null : h.id)} className="flex min-h-[38px] w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-ink-800">
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
                <span className={`tabular ml-auto font-mono ${h.net > 0 ? 'text-gold' : 'text-ink-400'}`}>{signed(h.net / 100)}</span>
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
    <div className="flex flex-col gap-1 border-t border-ink-700 px-2.5 py-2 text-[11.5px]">
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
                <span key={i} className={r.player === HUMAN ? 'text-ink-100' : 'text-ink-400'}>
                  {r.player === HUMAN ? 'You' : 'Bot'} {describeAction(r, isBet)}
                  {g && (
                    <span className={`ml-1 font-mono text-[10px] ${g.label === 'Best' || g.label === 'Good' ? 'text-ink-300' : 'text-gold'}`} title={`GTO preferred ${CODE_LABELS[g.bestCode]}`}>
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
