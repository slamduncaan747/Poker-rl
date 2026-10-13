import { ARCHETYPES, STAT_INFO, type StatKey, type Style } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARCHETYPE_BLURB } from '../components/brain/ReadTab';
import { LineChart } from '../components/charts/LineChart';
import { MiniCard } from '../components/table/PlayingCard';
import { Panel, Segmented } from '../components/ui/Controls';
import { pct, signed } from '../lib/format';
import type { ArenaIn, ArenaOpponent, ArenaOut, ArenaSample, ArenaTick } from '../workers/arena.worker';

const ICONS: Record<string, string> = {
  station: '📞',
  maniac: '🔥',
  nit: '🪨',
  tag: '🎯',
  lag: '⚡',
  scared: '😰',
  fish: '🐟',
  gto: '⚖️',
  custom: '🛠️',
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
    const w = new Worker(new URL('../workers/arena.worker.ts', import.meta.url), { type: 'module' });
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
      { name: 'Exploit AI (GTO + RL)', color: 'var(--color-exploit)', points: ticks.map((t) => [t.hand, t.exploit] as [number, number]) },
      { name: 'GTO blueprint only', color: 'var(--color-gto)', points: ticks.map((t) => [t.hand, t.gto] as [number, number]) },
    ],
    [ticks],
  );
  const tiltSeries = useMemo(() => [{ name: 'Deviation from GTO', color: 'var(--color-exploit)', points: ticks.slice(1).map((t) => [t.hand, t.tilt * 100] as [number, number]) }], [ticks]);

  const oppName = opp === 'gto' ? 'GTO Blueprint' : opp === 'custom' ? 'Custom opponent' : ARCHETYPES[opp].name;
  const significant = prog && Math.abs(prog.diffMean) > 1.96 * prog.diffSE;

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-12 lg:px-6">
      <div className="mb-6 mt-2 max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          The <span className="text-gradient">Arena</span>
        </h1>
        <p className="mt-2 text-ink-300">
          Pit the bot against a player archetype for thousands of hands. Both the <span className="text-exploit-hi">Exploit AI</span> and the pure{' '}
          <span className="text-gto-hi">GTO blueprint</span> play the <em>same deals</em> from the <em>same seats</em> (duplicate format), so the gap between the curves is the value the RL layer adds — not luck.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Panel title="1 · Choose an opponent">
            <div className="grid grid-cols-3 gap-2">
              {OPPONENTS.map((id) => {
                const name = id === 'gto' ? 'GTO Bot' : id === 'custom' ? 'Custom' : ARCHETYPES[id].name;
                return (
                  <button
                    key={id}
                    onClick={() => setOpp(id)}
                    disabled={running}
                    className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center text-[11px] ring-1 transition ${
                      opp === id ? 'bg-exploit/15 text-ink-100 ring-exploit/50' : 'bg-white/[0.03] text-ink-300 ring-white/5 hover:bg-white/[0.06]'
                    } disabled:opacity-50`}
                  >
                    <span className="text-xl">{ICONS[id]}</span>
                    <span className="leading-tight">{name}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 min-h-[34px] text-[12px] text-ink-400">
              {opp === 'custom' ? 'Design a player with the knobs below — the bot has never seen this exact style.' : ARCHETYPE_BLURB[opp]}
            </p>
            {opp === 'custom' && (
              <div className="mt-2 flex flex-col gap-2.5">
                {CUSTOM_KNOBS.map((k) => (
                  <label key={k.key} className="flex flex-col gap-1">
                    <span className="flex justify-between text-[12px] text-ink-300">
                      {k.label}
                      <span className="tabular font-mono text-ink-100">{k.fmt ? k.fmt(custom[k.key] as number) : String(custom[k.key])}</span>
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
          </Panel>
          <Panel title="2 · Run the match">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-300">Deals</span>
                <Segmented
                  value={String(hands)}
                  onChange={(v) => setHands(Number(v))}
                  options={[
                    { value: '500', label: '500' },
                    { value: '2000', label: '2k' },
                    { value: '10000', label: '10k' },
                  ]}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-300">Speed</span>
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
                <button onClick={stop} className="btn mt-1 bg-white/10 py-3 text-sm hover:bg-white/15">
                  Stop
                </button>
              ) : (
                <button
                  onClick={start}
                  disabled={!ready}
                  className="btn mt-1 bg-gradient-to-r from-gto to-exploit py-3 text-sm text-white shadow-[0_10px_30px_-10px_rgba(232,95,42,0.7)] hover:brightness-110"
                >
                  {ready ? `Start ${hands.toLocaleString()} deals vs ${oppName}` : 'Loading models…'}
                </button>
              )}
              <p className="text-[11px] text-ink-500">Each deal is played 4×: both bots, both seats. Simulation runs in a Web Worker.</p>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BigStat label="Exploit AI" color="text-exploit-hi" mean={prog?.exploitMean} se={prog?.exploitSE} />
            <BigStat label="GTO blueprint" color="text-gto-hi" mean={prog?.gtoMean} se={prog?.gtoSE} />
            <div className="glass rounded-2xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">RL edge (exploit − GTO)</div>
              <div className={`tabular mt-1 font-display text-3xl font-bold ${prog && prog.diffMean > 0 ? 'text-win' : prog ? 'text-loss' : 'text-ink-500'}`}>
                {prog ? signed(prog.diffMean * 100, 1) : '—'}
                <span className="ml-1 text-sm font-medium text-ink-400">bb/100</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
                {prog ? `±${(1.96 * prog.diffSE * 100).toFixed(1)} (95% CI)` : 'paired difference'}
                {prog && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${significant ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-ink-400'}`}>
                    {significant ? 'significant' : 'not yet significant'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Panel
            title={`Cumulative winnings vs ${oppName}`}
            right={
              prog && (
                <span className="tabular font-mono text-xs text-ink-400">
                  {prog.done.toLocaleString()} / {prog.total.toLocaleString()} deals
                </span>
              )
            }
          >
            {prog && (
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/5">
                <motion.div className="h-full bg-gradient-to-r from-gto to-exploit" animate={{ width: `${(prog.done / prog.total) * 100}%` }} />
              </div>
            )}
            <LineChart series={series} height={260} xLabel="deals played" yLabel="big blinds" formatY={(v) => v.toFixed(0)} empty="Pick an opponent and press Start" />
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="The bot's read on the opponent">
              {prog ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    {prog.read.map((r, i) => (
                      <div key={r.id} className="grid grid-cols-[120px_1fr_44px] items-center gap-2 text-[12px]">
                        <span className={i === 0 ? 'font-semibold text-ink-100' : 'text-ink-400'}>
                          {ICONS[r.id]} {r.name}
                        </span>
                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                          <motion.div className="h-full rounded-full" style={{ background: i === 0 ? 'var(--color-exploit)' : 'var(--color-ink-500)' }} animate={{ width: `${r.prob * 100}%` }} />
                        </div>
                        <span className="tabular text-right font-mono text-ink-300">{pct(r.prob)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink-400">Biggest leaks detected</div>
                    {prog.stats
                      .filter((s) => s.opps >= 5)
                      .sort((a, b) => Math.abs(b.mean - b.baseline) - Math.abs(a.mean - a.baseline))
                      .slice(0, 5)
                      .map((s) => (
                        <div key={s.key} className="flex items-center justify-between py-0.5 text-[12px]">
                          <span className="text-ink-300">{STAT_INFO[s.key as StatKey].label}</span>
                          <span className="tabular font-mono">
                            <span className="text-ink-100">{pct(s.mean)}</span>
                            <span className="text-ink-500"> vs GTO {pct(s.baseline)}</span>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-ink-500">The opponent model fills in as hands are played.</div>
              )}
            </Panel>
            <Panel title="How far the bot deviates from GTO">
              <LineChart series={tiltSeries} height={180} xLabel="deals played" formatY={(v) => `${v.toFixed(0)}%`} empty="—" />
              <p className="mt-2 text-[11.5px] text-ink-400">
                Total-variation distance between the bot's action-group mix and the blueprint (moving average). It starts near zero — the Bayesian
                prior assumes a balanced opponent — and grows only as evidence of a leak accumulates. Against the GTO bot it stays flat.
              </p>
            </Panel>
          </div>

          {samples.length > 0 && (
            <Panel title="Live hand feed">
              <div className="flex flex-col gap-1">
                {samples.map((s) => (
                  <div key={s.hand} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="w-14 font-mono text-ink-500">#{s.hand}</span>
                    <span className="flex gap-0.5">
                      <MiniCard card={s.heroCards[0]} />
                      <MiniCard card={s.heroCards[1]} />
                    </span>
                    <span className="text-ink-500">vs</span>
                    <span className="flex gap-0.5">
                      <MiniCard card={s.oppCards[0]} />
                      <MiniCard card={s.oppCards[1]} />
                    </span>
                    <span className="flex gap-0.5 pl-2">
                      {s.board.map((c) => (
                        <MiniCard key={c} card={c} />
                      ))}
                    </span>
                    <span className="ml-auto tabular font-mono">
                      <span className={s.exploitNet >= 0 ? 'text-exploit-hi' : 'text-ink-400'}>{signed(s.exploitNet)}</span>
                      <span className="text-ink-600"> / </span>
                      <span className={s.gtoNet >= 0 ? 'text-gto-hi' : 'text-ink-400'}>{signed(s.gtoNet)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, color, mean, se }: { label: string; color: string; mean?: number; se?: number }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">{label}</div>
      <div className={`tabular mt-1 font-display text-3xl font-bold ${mean !== undefined ? color : 'text-ink-500'}`}>
        {mean !== undefined ? signed(mean * 100, 1) : '—'}
        <span className="ml-1 text-sm font-medium text-ink-400">bb/100</span>
      </div>
      <div className="mt-1 text-[11px] text-ink-400">{se !== undefined ? `±${(1.96 * se * 100).toFixed(1)} (95% CI)` : 'win rate'}</div>
    </div>
  );
}
