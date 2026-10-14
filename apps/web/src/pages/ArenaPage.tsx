import { ARCHETYPES, type StatKey } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart } from '../components/charts/LineChart';
import { pct, per100 } from '../lib/format';
import { HABIT, STYLES } from '../lib/otto';
import type { ArenaIn, ArenaOpponent, ArenaOut, ArenaTick } from '../workers/arena.worker';
import ArenaWorker from '../workers/arena.worker.ts?worker&inline';

const DEALS = 2000;

/** The opponents, in plain words. */
const OPPONENTS: Array<{ id: string; name: string; about: string }> = [
  { id: 'station', name: 'Calling station', about: 'Calls almost every bet.' },
  { id: 'maniac', name: 'Maniac', about: 'Bets and raises nearly every hand.' },
  { id: 'nit', name: 'Rock', about: 'Plays only strong hands and folds under pressure.' },
  { id: 'scared', name: 'Scared money', about: 'Gives up whenever someone bets.' },
  { id: 'fish', name: 'Passive player', about: 'Plays lots of hands but rarely bets.' },
  { id: 'lag', name: 'Loose-aggressive', about: 'Plays many hands and plays them hard.' },
  { id: 'tag', name: 'Solid regular', about: 'Tight and aggressive, few obvious leaks.' },
  { id: 'gto', name: 'Balanced bot', about: 'Perfectly balanced. Nothing to exploit.' },
];

type Progress = Extract<ArenaOut, { type: 'progress' }>;

/**
 * Otto and the balanced AI play the same deals against the same opponent;
 * the gap between them is what adapting is worth.
 */
export function ArenaPage() {
  const worker = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [opp, setOpp] = useState('station');
  const [ticks, setTicks] = useState<ArenaTick[]>([]);
  const [prog, setProg] = useState<Progress | null>(null);

  const start = (id = opp) => {
    const o: ArenaOpponent = id === 'gto' ? { kind: 'gto' } : { kind: 'style', style: ARCHETYPES[id] };
    setTicks([{ hand: 0, exploit: 0, gto: 0, tilt: 0 }]);
    setProg(null);
    worker.current?.postMessage({ type: 'start', opponent: o, hands: DEALS, turbo: true, seed: (Math.random() * 1e9) | 0, lambda: 1 } satisfies ArenaIn);
  };

  useEffect(() => {
    const w = new ArenaWorker();
    worker.current = w;
    w.onmessage = (e: MessageEvent<ArenaOut>) => {
      const m = e.data;
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'progress') {
        setTicks((t) => [...t, ...m.ticks]);
        setProg(m);
      }
    };
    const base = document.baseURI;
    w.postMessage({ type: 'init', blueprintUrl: new URL('models/blueprint.json', base).href, exploitUrl: new URL('models/exploit.json', base).href } satisfies ArenaIn);
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (ready) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const pick = (id: string) => {
    setOpp(id);
    if (ready) start(id);
  };

  const series = useMemo(
    () => [
      { name: 'Otto', color: 'var(--color-exploit)', points: ticks.map((t) => [t.hand, t.exploit * 2] as [number, number]) },
      { name: 'Balanced AI', color: 'var(--color-gto)', dashed: true, points: ticks.map((t) => [t.hand, t.gto * 2] as [number, number]) },
    ],
    [ticks],
  );

  const o = OPPONENTS.find((x) => x.id === opp)!;
  const done = !!prog?.finished;
  const clear = !!prog && Math.abs(prog.diffMean) > 1.96 * prog.diffSE;
  const read = prog?.read[0];
  const habits = prog
    ? prog.stats
        .filter((s) => s.opps >= 10 && HABIT[s.key as StatKey])
        .sort((a, b) => Math.abs(b.mean - b.baseline) - Math.abs(a.mean - a.baseline))
        .slice(0, 3)
    : [];

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 pb-16 pt-8 lg:px-6">
      <header>
        <h1 className="text-[34px] font-extrabold leading-tight sm:text-[42px]">Arena</h1>
        <p className="mt-2 max-w-[620px] text-[16px] text-ink-300">
          Otto and a balanced AI play the same cards against the same opponent. The gap between them is what adapting is worth.
        </p>
      </header>

      <div>
        <div role="radiogroup" aria-label="Opponent" className="flex flex-wrap gap-1.5">
          {OPPONENTS.map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={opp === x.id}
              onClick={() => pick(x.id)}
              className={`min-h-[38px] border px-3.5 text-[14px] transition ${opp === x.id ? 'border-ink-100 bg-ink-100 font-bold text-ink-950' : 'border-ink-600 text-ink-300 hover:border-ink-300 hover:text-ink-100'}`}
            >
              {x.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-ink-400">{o.about}</p>
      </div>

      <section className="border border-ink-600 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Big label="Otto, adapting" value={prog ? per100(prog.exploitMean) : '—'} color="text-exploit-hi" swatch="h-[3px] bg-exploit" />
          <Big label="Balanced AI" value={prog ? per100(prog.gtoMean) : '—'} color="text-gto-hi" swatch="h-0 border-t-2 border-dashed border-gto" />
        </div>
        <div className="mt-6">
          <LineChart
            legend={false}
            series={series}
            height={260}
            xLabel="hands"
            formatY={(v) => `${v < 0 ? '−' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.abs(v).toFixed(0)}`}
            empty="Loading the AI…"
          />
        </div>
        <div className="mt-3 h-[2px] bg-ink-700">
          <motion.div className="h-full bg-ink-300" animate={{ width: `${prog ? (prog.done / prog.total) * 100 : 0}%` }} transition={{ duration: 0.15 }} />
        </div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[15px] text-ink-200">
            {!prog
              ? 'Simulating…'
              : !done
                ? `Simulating ${prog.done.toLocaleString()} of ${prog.total.toLocaleString()} hands…`
                : clear
                  ? `Adapting is worth ${per100(prog.diffMean)} per 100 hands against this player.`
                  : `Too close to call — against this player, adapting barely matters.`}
          </p>
          {done && (
            <button onClick={() => start()} className="font-mono text-[11px] tracking-[0.08em] text-ink-400 hover:text-ink-100">
              RUN AGAIN
            </button>
          )}
        </div>
      </section>

      {prog && read && (
        <section>
          <h2 className="eyebrow mb-3">What Otto figured out</h2>
          <p className="text-[16px] text-ink-200">
            After {prog.done.toLocaleString()} hands it reads this player as a <span className="font-bold text-gold">{(STYLES[read.id]?.name ?? read.name).toLowerCase()}</span>{' '}
            <span className="text-ink-400">({pct(read.prob)} sure)</span>.
          </p>
          {habits.length > 0 && (
            <div className="mt-4 flex flex-col border-t border-ink-700">
              {habits.map((s) => (
                <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-ink-700 py-3">
                  <span className="text-[14.5px]">{HABIT[s.key as StatKey]}</span>
                  <div className="flex items-center gap-3">
                    <div className="relative h-2.5 flex-1" aria-hidden="true">
                      <span className="absolute inset-x-0 top-1/2 h-px bg-ink-600" />
                      <span className="absolute inset-y-0 w-px bg-ink-100" style={{ left: `${s.baseline * 100}%` }} />
                      <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" style={{ left: `${s.mean * 100}%` }} />
                    </div>
                    <span className="tabular w-[92px] text-right font-mono text-[12px]">
                      <span className="text-gold">{pct(s.mean)}</span>
                      <span className="text-ink-500"> · {pct(s.baseline)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 font-mono text-[10.5px] tracking-[0.06em] text-ink-500">ORANGE = THIS PLAYER · LINE = BALANCED PLAY</p>
        </section>
      )}
    </div>
  );
}

function Big({ label, value, color, swatch }: { label: string; value: string; color: string; swatch: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 text-[14px] text-ink-300">
        <span className={`w-5 ${swatch}`} />
        {label}
      </div>
      <div className={`tabular mt-1.5 font-mono text-[34px] font-bold leading-none ${color}`}>
        {value}
        <span className="ml-1.5 text-[13px] font-normal text-ink-500">/ 100 hands</span>
      </div>
    </div>
  );
}
