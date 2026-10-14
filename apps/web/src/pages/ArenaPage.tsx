import { ARCHETYPES, STAT_INFO, type StatKey, type Style } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart } from '../components/charts/LineChart';
import { MiniCard } from '../components/table/PlayingCard';
import { Segmented } from '../components/ui/Controls';
import { pct, per100, signedMoney } from '../lib/format';
import type { ArenaIn, ArenaOpponent, ArenaOut, ArenaSample, ArenaTick } from '../workers/arena.worker';
import ArenaWorker from '../workers/arena.worker.ts?worker&inline';

const ARCHETYPE_BLURB: Record<string, string> = {
  gto: 'Balanced and hard to exploit — Otto stays near equilibrium.',
  station: 'Calls too much. Otto value-bets thinner and bluffs less.',
  maniac: 'Bets and raises relentlessly. Otto calls down lighter and traps.',
  nit: 'Plays very few hands and folds under pressure. Otto steals and bluffs more.',
  tag: 'Solid and aggressive. Few leaks — Otto makes small adjustments.',
  lag: 'Loose and aggressive. Otto widens its calling and 3-betting ranges.',
  scared: 'Folds too often to aggression. Otto applies maximum pressure.',
  fish: 'Loose and passive. Otto isolates and value-bets relentlessly.',
};

const LABELS: Record<string, string> = {
  station: 'Calling station',
  maniac: 'Maniac',
  nit: 'Rock',
  tag: 'Tight-aggressive',
  lag: 'Loose-aggressive',
  scared: 'Scared money',
  fish: 'Loose-passive',
  gto: 'Balanced bot',
  custom: 'Design your own',
};

const OPPONENTS = [...Object.keys(ARCHETYPES), 'gto', 'custom'];

type Progress = Extract<ArenaOut, { type: 'progress' }>;

const CUSTOM_KNOBS: Array<{ key: keyof Style; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }> = [
  { key: 'vpip', label: 'Hands played (VPIP)', min: 0.1, max: 0.97, step: 0.01, fmt: pct },
  { key: 'pfr', label: 'Preflop raise %', min: 0.02, max: 0.9, step: 0.01, fmt: pct },
  { key: 'aggression', label: 'Value aggression', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'bluff', label: 'Bluff frequency', min: 0, max: 0.7, step: 0.01, fmt: pct },
  { key: 'callDown', label: 'Stickiness (calls down)', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'sizing', label: 'Bet size (× pot)', min: 0.25, max: 1.6, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
];

export function ArenaPage() {
  const worker = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [opp, setOpp] = useState('station');
  const [custom, setCustom] = useState<Style>({ ...ARCHETYPES.lag, id: 'custom', name: 'Custom' });
  const [hands, setHands] = useState(2000);
  const [turbo, setTurbo] = useState(true);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<ArenaTick[]>([]);
  const [prog, setProg] = useState<Progress | null>(null);
  const [samples, setSamples] = useState<ArenaSample[]>([]);

  useEffect(() => {
    const w = new ArenaWorker();
    worker.current = w;
    w.onmessage = (e: MessageEvent<ArenaOut>) => {
      const m = e.data;
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'progress') {
        setTicks((t) => [...t, ...m.ticks]);
        setProg(m);
        if (m.sample) setSamples((s) => (s[0]?.hand === m.sample!.hand ? s : [m.sample!, ...s].slice(0, 7)));
        if (m.finished) setRunning(false);
      }
    };
    const base = document.baseURI;
    w.postMessage({ type: 'init', blueprintUrl: new URL('models/blueprint.json', base).href, exploitUrl: new URL('models/exploit.json', base).href } satisfies ArenaIn);
    return () => w.terminate();
  }, []);

  const start = () => {
    const o: ArenaOpponent = opp === 'gto' ? { kind: 'gto' } : { kind: 'style', style: opp === 'custom' ? custom : ARCHETYPES[opp] };
    setTicks([{ hand: 0, exploit: 0, gto: 0, tilt: 0 }]);
    setProg(null);
    setSamples([]);
    setRunning(true);
    worker.current?.postMessage({ type: 'start', opponent: o, hands, turbo, seed: (Math.random() * 1e9) | 0, lambda: 1 } satisfies ArenaIn);
  };
  // Run the default match as soon as the models are in, so the page opens on a result.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (ready && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const stop = () => {
    worker.current?.postMessage({ type: 'stop' } satisfies ArenaIn);
    setRunning(false);
  };
  const toggleTurbo = (t: boolean) => {
    setTurbo(t);
    worker.current?.postMessage({ type: 'turbo', turbo: t } satisfies ArenaIn);
  };

  const series = useMemo(
    () => [
      { name: 'Otto', color: 'var(--color-exploit)', points: ticks.map((t) => [t.hand, t.exploit * 2] as [number, number]) },
      { name: 'Balanced', color: 'var(--color-gto)', dashed: true, points: ticks.map((t) => [t.hand, t.gto * 2] as [number, number]) },
    ],
    [ticks],
  );
  const tiltSeries = useMemo(() => [{ name: 'Changed play', color: 'var(--color-exploit)', points: ticks.slice(1).map((t) => [t.hand, t.tilt * 100] as [number, number]) }], [ticks]);

  const oppName = LABELS[opp];
  const significant = !!prog && Math.abs(prog.diffMean) > 1.96 * prog.diffSE;
  const blurb = opp === 'custom' ? 'Your own design.' : (ARCHETYPE_BLURB[opp] ?? '').split('. ')[0].replace(/\.$/, '');
  const lastTilt = ticks.length > 1 ? ticks[ticks.length - 1].tilt : null;
  const leaks = prog
    ? prog.stats
        .filter((s) => s.opps >= 5)
        .sort((a, b) => Math.abs(b.mean - b.baseline) - Math.abs(a.mean - a.baseline))
        .slice(0, 4)
    : [];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 lg:px-6">
      <div className="mb-6 mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Arena</h1>
          <p className="mt-2 text-[17px] text-ink-300">
            Same cards. <span className="text-exploit">Otto</span> vs a balanced bot.
          </p>
        </div>
        {prog && (
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.08em] text-ink-400">
            <span className="relative h-[2px] w-40 bg-ink-600">
              <motion.span className="absolute inset-y-0 left-0 bg-gold" animate={{ width: `${(prog.done / prog.total) * 100}%` }} />
            </span>
            <span className="tabular text-ink-100">{prog.done.toLocaleString()}</span> / {prog.total.toLocaleString()}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="glass self-start" aria-label="Match setup">
          <div className="border-b border-ink-100 px-3.5 py-2.5 font-mono text-[11px] tracking-[0.08em]">OPPONENT</div>
          <div role="radiogroup" aria-label="Opponent" className="grid grid-cols-2">
            {OPPONENTS.map((id, i) => {
              const name = LABELS[id];
              const on = opp === id;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={on}
                  aria-label={name}
                  title={name}
                  onClick={() => setOpp(id)}
                  disabled={running}
                  className={`min-h-[46px] border-ink-600 px-3 text-left text-[13.5px] transition disabled:opacity-50 ${i % 2 ? 'border-l' : ''} ${i >= 2 ? 'border-t' : ''} ${id === 'custom' ? 'col-span-2' : ''} ${
                    on ? 'bg-ink-100 font-bold text-ink-950' : id === 'custom' ? 'text-ink-400 hover:text-ink-100' : 'text-ink-100 hover:bg-ink-800'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="border-t border-ink-100 px-3.5 py-3">
            <div className="font-bold">{oppName}</div>
            <div className="mt-0.5 text-[13px] text-ink-400">{blurb}</div>
          </div>
          {opp === 'custom' && (
            <div className="flex flex-col gap-3 border-t border-ink-600 px-3.5 py-3.5">
              {CUSTOM_KNOBS.map((k) => (
                <label key={k.key} className="flex flex-col gap-1.5">
                  <span className="flex justify-between font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
                    {k.label}
                    <span className="tabular text-ink-100">{k.fmt ? k.fmt(custom[k.key] as number) : String(custom[k.key])}</span>
                  </span>
                  <input
                    type="range"
                    className="slider"
                    min={k.min}
                    max={k.max}
                    step={k.step}
                    disabled={running}
                    value={custom[k.key] as number}
                    style={{ ['--fill' as string]: `${(((custom[k.key] as number) - k.min) / (k.max - k.min)) * 100}%` }}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCustom((c) => {
                        const n = { ...c, [k.key]: v };
                        if (n.pfr > n.vpip) n.pfr = n.vpip;
                        return n;
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-ink-600 p-3.5">
            <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
              DEALS
              <Segmented
                value={String(hands)}
                onChange={(v) => setHands(Number(v))}
                options={[
                  { value: '500', label: '500' },
                  { value: '2000', label: '2K' },
                  { value: '10000', label: '10K' },
                ]}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
              SPEED
              <Segmented
                value={turbo ? 'turbo' : 'watch'}
                onChange={(v) => toggleTurbo(v === 'turbo')}
                options={[
                  { value: 'watch', label: 'Watch' },
                  { value: 'turbo', label: 'Turbo' },
                ]}
              />
            </div>
            {running ? (
              <button onClick={stop} className="btn min-h-[52px] border border-ink-100 text-[16px] hover:bg-ink-800">
                Stop
              </button>
            ) : (
              <button onClick={start} disabled={!ready} className="btn btn-gold min-h-[52px] text-[16px]">
                {ready ? `Run ${hands.toLocaleString()} deals` : 'Loading…'}
              </button>
            )}
            <p className="font-mono text-[10px] tracking-[0.06em] text-ink-500">EACH DEAL × 4 · BOTH AIS · BOTH SEATS</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="glass grid grid-cols-1 sm:grid-cols-3">
            <Stat n={1} label="Otto" accent mean={prog?.exploitMean} se={prog?.exploitSE} />
            <Stat n={2} label="Balanced" mean={prog?.gtoMean} se={prog?.gtoSE} border />
            <div className="border-t border-ink-600 px-4 py-3.5 sm:border-l sm:border-t-0">
              <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
                GAIN
                {prog && (
                  <span className={`px-1.5 py-[1px] text-[9.5px] ${significant ? 'bg-ink-100 text-ink-950' : 'border border-dashed border-ink-500'}`}>
                    {significant ? 'CLEAR' : 'NOISY'}
                  </span>
                )}
              </div>
              <div className={`tabular mt-1 font-mono text-[30px] font-bold leading-none ${prog && prog.diffMean > 0 ? 'text-gold' : prog ? 'text-ink-100' : 'text-ink-500'}`}>
                {prog ? per100(prog.diffMean) : '—'}
              </div>
              <div className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-500">
                {prog ? `±$${(1.96 * prog.diffSE * 200).toFixed(0)} · ` : ''}PER 100 HANDS
              </div>
            </div>
          </div>

          <section className="glass p-4 sm:p-5" aria-label={`Winnings vs ${oppName}`}>
            <div className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">DOLLARS WON · VS {oppName.toUpperCase()}</div>
            <LineChart
              series={series}
              height={280}
              xLabel="deals"
              formatY={(v) => `${v < 0 ? '−' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : Math.abs(v).toFixed(0)}`}
              empty="Pick an opponent · Run"
              bracket={prog && ticks.length > 2 ? { a: 0, b: 1, label: per100(prog.diffMean), sub: '/100' } : undefined}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="glass" aria-label="What it learned">
              <div className="border-b border-ink-600 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">IT READS THEM AS</div>
              {prog ? (
                <>
                  <div className="flex flex-col gap-1.5 px-4 py-3">
                    {prog.read.slice(0, 3).map((r, i) => (
                      <div key={r.id} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-[13px]">
                        <span className={i === 0 ? 'font-bold' : 'text-ink-400'}>{LABELS[r.id] ?? r.name}</span>
                        <span className="h-[6px] bg-ink-700">
                          <motion.span className="block h-full" style={{ background: i === 0 ? 'var(--color-exploit)' : 'var(--color-ink-500)' }} animate={{ width: `${r.prob * 100}%` }} />
                        </span>
                        <span className="tabular text-right font-mono text-[12px] text-ink-300">{pct(r.prob)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-ink-600 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">LEAKS · | = BALANCED</div>
                  <div className="pb-2">
                    {leaks.map((s) => (
                      <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_130px_44px] items-center gap-3 px-4 py-2 text-[13px]">
                        <span className="truncate">{STAT_INFO[s.key as StatKey].label}</span>
                        <span className="relative h-[6px] bg-ink-700">
                          <motion.span className="absolute inset-y-0 left-0 bg-gold" animate={{ width: `${s.mean * 100}%` }} />
                          <span className="absolute -top-[4px] -bottom-[4px] w-px bg-ink-100" style={{ left: `${s.baseline * 100}%` }} />
                        </span>
                        <span className="tabular text-right font-mono text-[12px]">{pct(s.mean)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center font-mono text-[11px] tracking-[0.08em] text-ink-500">FILLS IN AS HANDS PLAY</div>
              )}
            </section>
            <section className="glass" aria-label="How much it changes its play">
              <div className="flex items-baseline justify-between border-b border-ink-600 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
                PLAYS DIFFERENTLY
                <span className="tabular text-[18px] font-bold text-ink-100">{lastTilt !== null ? pct(lastTilt) : '—'}</span>
              </div>
              <div className="p-4">
                <LineChart series={tiltSeries} height={190} xLabel="deals" formatY={(v) => `${v.toFixed(0)}%`} empty="—" />
              </div>
            </section>
          </div>

          {samples.length > 0 && (
            <section className="glass" aria-label="Live hands">
              <div className="flex justify-between border-b border-ink-600 px-4 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
                LIVE HANDS
                <span>
                  <span className="text-exploit">OTTO</span> / BALANCED
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex min-w-[560px] flex-col">
                  {samples.map((s) => (
                    <div key={s.hand} className="flex items-center gap-2 border-b border-ink-700 px-4 py-2 text-[12px] last:border-b-0">
                      <span className="w-14 font-mono text-ink-500">{s.hand}</span>
                      <span className="flex gap-0.5">
                        <MiniCard card={s.heroCards[0]} />
                        <MiniCard card={s.heroCards[1]} />
                      </span>
                      <span className="font-mono text-ink-500">vs</span>
                      <span className="flex gap-0.5">
                        <MiniCard card={s.oppCards[0]} />
                        <MiniCard card={s.oppCards[1]} />
                      </span>
                      <span className="hidden gap-0.5 pl-3 sm:flex">
                        {s.board.map((c) => (
                          <MiniCard key={c} card={c} />
                        ))}
                      </span>
                      <span className="tabular ml-auto font-mono">
                        <span className={s.exploitNet >= 0 ? 'text-exploit' : 'text-ink-400'}>{signedMoney(s.exploitNet * 100)}</span>
                        <span className="text-ink-600"> / </span>
                        <span className={s.gtoNet >= 0 ? 'text-ink-100' : 'text-ink-400'}>{signedMoney(s.gtoNet * 100)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, accent, mean, se, border }: { n: number; label: string; accent?: boolean; mean?: number; se?: number; border?: boolean }) {
  return (
    <div className={`px-4 py-3.5 ${border ? 'border-t border-ink-600 sm:border-l sm:border-t-0' : ''}`}>
      <div className={`flex items-center gap-2 font-mono text-[10.5px] tracking-[0.08em] ${accent ? 'text-gold' : 'text-ink-400'}`}>
        <span className="balloon" style={{ width: 17, height: 17, fontSize: 9.5 }}>
          {n}
        </span>
        {label.toUpperCase()}
      </div>
      <div className={`tabular mt-1 font-mono text-[30px] font-bold leading-none ${mean === undefined ? 'text-ink-500' : 'text-ink-100'}`}>
        {mean !== undefined ? per100(mean) : '—'}
      </div>
      <div className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-500">{se !== undefined ? `±$${(1.96 * se * 200).toFixed(0)} · ` : ''}PER 100 HANDS</div>
    </div>
  );
}
