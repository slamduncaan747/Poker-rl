import { ARCHETYPES } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { EvalChart } from '../components/charts/EvalChart';
import { LineChart } from '../components/charts/LineChart';
import { OttoFace } from '../components/table/Otto';
import { Footer } from '../components/ui/Footer';
import { per100 } from '../lib/format';
import { usePlay } from '../lib/store';
import type { ArenaIn, ArenaOut, ArenaTick } from '../workers/arena.worker';
import ArenaWorker from '../workers/arena.worker.ts?worker&inline';

const DEMO_DEALS = 1200;

/**
 * The landing page: what Otto is in one line, a live simulation that proves
 * the adaptive layer works, three steps for how, and the evaluation.
 */
export function HomePage() {
  const models = usePlay((s) => s.models);
  const bp = models?.blueprint.file;
  const ex = models?.exploit;
  const versus = ex?.evaluation.filter((r) => r.opponent !== 'GTO Blueprint') ?? [];
  const avgGain = versus.length ? versus.reduce((a, r) => a + (r.exploit - r.gto), 0) / versus.length : null;

  return (
    <div>
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-14 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:px-6">
        <div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
            <OttoFace mood="reading" size={44} />
            <span className="eyebrow">A poker AI, built from scratch</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-[40px] font-extrabold leading-[1.02] tracking-tight sm:text-[58px]"
          >
            Otto learns how you play poker. <span className="text-gold">Then it beats you for it.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-5 max-w-[540px] text-[17px] leading-relaxed text-ink-300">
            It starts from unexploitable poker learned through self-play, reads your habits as you play, and uses a neural network trained with reinforcement learning to exploit them. Everything runs live in your browser.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#play" onClick={() => usePlay.getState().phase === 'idle' && setTimeout(() => usePlay.getState().newHand(), 300)} className="btn btn-gold min-h-[54px] px-8 text-[17px]">
              Play Otto →
            </a>
            <a href="#how" className="btn min-h-[54px] border border-ink-100 px-6 text-[15px] hover:bg-ink-800">
              How it works
            </a>
          </motion.div>
          <div className="mt-4 font-mono text-[10.5px] tracking-[0.08em] text-ink-500">NO POKER EXPERIENCE NEEDED · NO SIGN-UP</div>
        </div>
        <LiveProof />
      </section>

      <section className="border-y border-ink-600 bg-ink-900/60">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 sm:grid-cols-4">
          <Fact value={bp ? `${Math.round(bp.meta.iterations / 1e6)}M` : '—'} label="games of self-play" />
          <Fact value={ex ? `${(ex.meta.hands / 1e6).toFixed(1)}M` : '—'} label="hands of RL training" border />
          <Fact value="16" label="habits it tracks on you" border />
          <Fact value={avgGain !== null ? per100(avgGain / 100) : '—'} label="extra won per 100 hands by adapting" border accent />
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 lg:px-6">
        <h2 className="max-w-[640px] text-[28px] font-extrabold leading-tight sm:text-[34px]">Three layers, one decision every time Otto acts.</h2>
        <div className="mt-8 grid border border-ink-600 md:grid-cols-3">
          <Step n={1} title="Plays balanced poker" tech="Monte Carlo CFR · card & bet abstraction · 40K strategy spots">
            Otto learned a game-theory-optimal strategy by playing itself millions of times. On its own it can't be beaten in the long run.
          </Step>
          <Step n={2} title="Reads you" tech="16 Beta-Bernoulli posteriors · Bayesian player-type matching" border>
            Every hand updates its estimates of your habits: how often you fold, bluff, call down. Thin evidence stays close to balanced.
          </Step>
          <Step n={3} title="Adapts to exploit you" tech="Policy network trained with PPO · bounded tilt from equilibrium" border accent>
            A neural network shifts its strategy toward the plays that punish your habits — and tells you which habit it is punishing.
          </Step>
        </div>
        <a href="#how" className="mt-4 inline-block font-mono text-[11px] tracking-[0.08em] text-ink-400 hover:text-ink-100">
          READ THE FULL WRITE-UP →
        </a>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-6">
        <div>
          <div className="eyebrow">Results</div>
          <h2 className="mt-3 text-[28px] font-extrabold leading-tight sm:text-[34px]">Adapting wins more against every human-like style.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Otto and the balanced AI each played 30,000 hands against seven simulated player types, on identical cards with seats swapped to cancel luck. Against a perfect balanced opponent Otto breaks even — it doesn't invent leaks that aren't there.
          </p>
          <a href="#arena" className="mt-6 inline-block font-mono text-[11px] tracking-[0.08em] text-ink-400 hover:text-ink-100">
            RE-RUN ANY MATCHUP IN THE ARENA →
          </a>
        </div>
        <div className="border border-ink-600 p-5">{ex ? <EvalChart rows={ex.evaluation} /> : <div className="h-[300px]" />}</div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-20 lg:px-6">
        <div className="grid border border-ink-600 md:grid-cols-3">
          <Explore href="#play" title="Play Otto" body="Heads-up hold'em. Every decision you make gets graded, Brilliant to Blunder." />
          <Explore href="#you" title="See your style" body="Where you sit among player types, and how exploitable a clone of you is." border />
          <Explore href="#lab" title="Open the strategy" body="Browse the full preflop strategy and how it bets after the flop." border />
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Fact({ value, label, border, accent }: { value: string; label: string; border?: boolean; accent?: boolean }) {
  return (
    <div className={`px-4 py-6 lg:px-6 ${border ? 'border-l border-ink-600 max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t' : ''}`}>
      <div className={`tabular font-mono text-[28px] font-bold leading-none sm:text-[34px] ${accent ? 'text-gold' : ''}`}>{value}</div>
      <div className="mt-2 text-[13px] text-ink-400">{label}</div>
    </div>
  );
}

function Step({ n, title, tech, children, border, accent }: { n: number; title: string; tech: string; children: ReactNode; border?: boolean; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 p-6 ${border ? 'border-t border-ink-600 md:border-l md:border-t-0' : ''}`}>
      <span className={`balloon ${accent ? 'text-gold' : ''}`}>{n}</span>
      <h3 className="text-[19px] font-bold">{title}</h3>
      <p className="text-[14.5px] leading-relaxed text-ink-300">{children}</p>
      <p className="mt-auto pt-2 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.06em] text-ink-500">{tech}</p>
    </div>
  );
}

function Explore({ href, title, body, border }: { href: string; title: string; body: string; border?: boolean }) {
  return (
    <a href={href} className={`group flex flex-col gap-2 p-6 transition hover:bg-ink-900 ${border ? 'border-t border-ink-600 md:border-l md:border-t-0' : ''}`}>
      <span className="flex items-center justify-between text-[18px] font-bold">
        {title}
        <span className="text-ink-500 transition group-hover:translate-x-1 group-hover:text-gold">→</span>
      </span>
      <span className="text-[14px] leading-relaxed text-ink-400">{body}</span>
    </a>
  );
}

/**
 * A live match in a worker: Otto and the balanced AI play the same cards
 * against a simulated calling station, and the gap between their winnings
 * is the adaptive layer at work.
 */
function LiveProof() {
  const worker = useRef<Worker | null>(null);
  const [ticks, setTicks] = useState<ArenaTick[]>([{ hand: 0, exploit: 0, gto: 0, tilt: 0 }]);
  const [prog, setProg] = useState<Extract<ArenaOut, { type: 'progress' }> | null>(null);
  const [ready, setReady] = useState(false);

  const start = () => {
    setTicks([{ hand: 0, exploit: 0, gto: 0, tilt: 0 }]);
    setProg(null);
    worker.current?.postMessage({
      type: 'start',
      opponent: { kind: 'style', style: ARCHETYPES.station },
      hands: DEMO_DEALS,
      turbo: true,
      seed: (Math.random() * 1e9) | 0,
      lambda: 1,
      pace: { batch: 12, delay: 16 },
    } satisfies ArenaIn);
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

  const series = useMemo(
    () => [
      { name: 'Otto', color: 'var(--color-exploit)', points: ticks.map((t) => [t.hand, t.exploit * 2] as [number, number]) },
      { name: 'Balanced AI', color: 'var(--color-gto)', dashed: true, points: ticks.map((t) => [t.hand, t.gto * 2] as [number, number]) },
    ],
    [ticks],
  );
  const done = !!prog?.finished;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="border border-ink-600 bg-ink-950/80 p-5">
      <div className="flex items-center justify-between gap-3 font-mono text-[10.5px] tracking-[0.08em]">
        <span className="flex items-center gap-2 text-ink-300">
          <span className={`h-2 w-2 rounded-full ${done ? 'bg-ink-500' : 'animate-pulse bg-gold'}`} />
          {done ? 'SIMULATED LIVE IN YOUR BROWSER' : ready ? 'SIMULATING LIVE IN YOUR BROWSER' : 'LOADING THE AI'}
        </span>
        {done && (
          <button onClick={start} className="text-ink-400 hover:text-ink-100">
            REPLAY
          </button>
        )}
      </div>
      <div className="mt-3 text-[15px] text-ink-200">
        Two AIs, the same cards, the same opponent: a player who calls too much.
      </div>
      <div className="mt-4 flex flex-col gap-1.5 font-mono text-[11.5px]">
        {[
          { name: 'Otto, adapting', v: prog?.exploitMean, swatch: 'h-[3px] bg-exploit', cls: 'text-exploit-hi' },
          { name: 'Balanced AI', v: prog?.gtoMean, swatch: 'h-0 border-t-2 border-dashed border-gto', cls: 'text-gto-hi' },
        ].map((r) => (
          <div key={r.name} className="flex items-center gap-2.5">
            <span className={`w-5 ${r.swatch}`} />
            <span className="text-ink-200">{r.name}</span>
            <span className="ml-auto">
              <b className={`tabular ${r.cls}`}>{r.v !== undefined ? per100(r.v) : '—'}</b>
              <span className="text-ink-500"> / 100 hands</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <LineChart legend={false} series={series} height={240} xLabel="hands" formatY={(v) => `${v < 0 ? '−' : ''}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.abs(v).toFixed(0)}`} empty="Loading the AI…" />
      </div>
      <div className="mt-2 h-[2px] bg-ink-700">
        <motion.div className="h-full bg-ink-300" animate={{ width: `${prog ? (prog.done / prog.total) * 100 : 0}%` }} transition={{ duration: 0.15 }} />
      </div>
    </motion.div>
  );
}
