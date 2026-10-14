import { AIAgent, ARCHETYPES, type ArchetypeSignature, type OpponentSnapshot, OpponentModel, Rng, type StatKey, StyleAgent, TRAINING_SAMPLING, accuracy, matchArchetypes, playHand, randomDeal } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { MarkIcon } from '../components/brain/HandReview';
import { pct, per100, signedMoney } from '../lib/format';
import { findLeaks } from '../lib/leaks';
import { HABIT, MARKS, type Mark, STYLES, markOf, voice } from '../lib/otto';
import type { Models } from '../lib/models';
import { usePlay } from '../lib/store';
import type { CloneIn, CloneOut, CloneProgress } from '../workers/clone.worker';
import CloneWorker from '../workers/clone.worker.ts?worker&inline';

/** Hands before Otto's read (and the stress test) is shown. */
const MIN_HANDS = 10;
const SIM_HANDS = 4000;

/** Loose ↔ tight and passive ↔ aggressive, from the same statistics Otto tracks. */
const looseness = (s: Record<string, number>) => s.vpip;
const aggression = (s: Record<string, number>) => (s.pfr + s.postBet) / 2;

function statsOf(snap: OpponentSnapshot): Record<StatKey, number> {
  return Object.fromEntries(snap.stats.map((s) => [s.key, s.mean])) as Record<StatKey, number>;
}

const SAMPLE_TYPES = ['station', 'maniac', 'nit', 'scared', 'fish', 'lag'];
const SAMPLE_HANDS = 80;

/** Otto's read on a simulated player: a reference type watched for a few dozen hands. */
function sampleRead(models: Models, type: string, seed: number): OpponentModel {
  const model = new OpponentModel(models.exploit.baseline, undefined, models.exploit.baselineBetSize);
  const watcher = new AIAgent(models.blueprint, null, { sampling: TRAINING_SAMPLING }, model);
  const player = new StyleAgent(ARCHETYPES[type]);
  const rng = new Rng(seed);
  for (let i = 0; i < SAMPLE_HANDS; i++) playHand([watcher, player], randomDeal(rng), i & 1, rng);
  return model;
}

export function StylePage() {
  const bot = usePlay((s) => s.bot);
  const models = usePlay((s) => s.models);
  const history = usePlay((s) => s.history);
  const [sample, setSample] = useState<{ model: OpponentModel; id: number; type: string } | null>(null);
  if (!bot || !models) return null;
  const model = sample?.model ?? bot.model;
  const snap = model.snapshot();
  const n = snap.hands;
  const ready = !!sample || n >= MIN_HANDS;
  const top = matchArchetypes(model, models.exploit.signatures)[0];
  const style = STYLES[top.id] ?? STYLES.gto;
  const preview = () => {
    const id = (Math.random() * 1e9) | 0;
    const pool = SAMPLE_TYPES.filter((t) => t !== sample?.type);
    const type = pool[id % pool.length];
    setSample({ model: sampleRead(models, type, id), id, type });
  };

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-4 pb-16 pt-8 lg:px-6">
      <header>
        <div className="eyebrow">
          {sample ? `Sample player · ${n} hands` : `Your style · ${n} ${n === 1 ? 'hand' : 'hands'}`}
        </div>
        {ready ? (
          <>
            <h1 className="mt-2 text-[34px] font-extrabold leading-[1.05] sm:text-[44px]">
              {sample ? 'This player plays like a ' : 'You play like a '}
              <span className="text-gold">{style.name.toLowerCase()}</span>.
            </h1>
            <p className="mt-3 max-w-[620px] text-[16px] text-ink-300">{sample ? style.blurb.replace(/\bYou\b/g, 'They').replace(/\byou\b/g, 'them') : style.blurb}</p>
            {sample && (
              <div className="mt-4 flex gap-5 font-mono text-[11px] tracking-[0.08em]">
                <button onClick={preview} className="text-ink-300 hover:text-ink-100">
                  TRY ANOTHER SAMPLE
                </button>
                <button onClick={() => setSample(null)} className="text-ink-300 hover:text-ink-100">
                  BACK TO YOU
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-2 text-[34px] font-extrabold leading-[1.05] sm:text-[44px]">Otto is still reading you.</h1>
            <div className="mt-4 flex max-w-[520px] flex-wrap items-center gap-3">
              <span className="h-[3px] min-w-[120px] flex-1 bg-ink-700">
                <span className="block h-full bg-gold" style={{ width: `${(n / MIN_HANDS) * 100}%` }} />
              </span>
              <a href="#play" className="btn btn-gold min-h-[44px] px-6 text-sm">
                Play {MIN_HANDS - n} more
              </a>
              <button onClick={preview} className="btn min-h-[44px] border border-ink-600 px-4 text-sm hover:border-ink-100">
                Preview with a sample player
              </button>
            </div>
          </>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <h2 className="eyebrow mb-3">{sample ? 'Where they sit' : 'Where you sit'}</h2>
          <StyleMap snap={snap} signatures={models.exploit.signatures} faint={!ready} label={sample ? 'Sample' : 'You'} />
        </section>
        <section>
          <h2 className="eyebrow mb-3">Stress test</h2>
          {ready ? <StressTest key={sample ? `s${sample.id}` : 'you'} cacheKey={sample ? `s${sample.id}` : `you-${n}`} snap={snap} whose={sample ? "this player's" : 'your'} /> : <Locked text={`Unlocks after ${MIN_HANDS} hands`} />}
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <h2 className="eyebrow mb-3">What Otto noticed</h2>
          {ready ? <Noticed snap={snap} /> : <Locked text="Nothing yet" />}
        </section>
        {!sample && (
          <section>
            <h2 className="eyebrow mb-3">Your decisions</h2>
            <Decisions history={history} />
          </section>
        )}
      </div>
    </div>
  );
}

function Locked({ text }: { text: string }) {
  return <div className="grid min-h-[160px] place-items-center border border-dashed border-ink-600 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-500">{text}</div>;
}

/** A map of player types by looseness and aggression, with you on it. */
function StyleMap({ snap, signatures, faint, label }: { snap: OpponentSnapshot; signatures: ArchetypeSignature[]; faint: boolean; label: string }) {
  const W = 440;
  const H = 320;
  const m = { l: 18, r: 16, t: 16, b: 26 };
  const x = (v: number) => m.l + ((v - 0.1) / 0.8) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - (v / 0.7) * (H - m.t - m.b);
  const me = statsOf(snap);
  const mx = x(Math.min(0.9, Math.max(0.1, looseness(me))));
  const my = y(Math.min(0.7, Math.max(0, aggression(me))));
  const halo = Math.max(8, 70 / Math.sqrt(snap.hands + 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-ink-600" role="img" aria-label="Map of playing styles by looseness and aggression, with your position">
      {/* centre lines */}
      <line x1={x(0.5)} x2={x(0.5)} y1={m.t} y2={H - m.b} stroke="var(--color-ink-700)" strokeDasharray="3 4" />
      <line x1={m.l} x2={W - m.r} y1={y(0.35)} y2={y(0.35)} stroke="var(--color-ink-700)" strokeDasharray="3 4" />
      <g className="font-mono" fontSize="9.5" letterSpacing="0.08em" fill="var(--color-ink-500)">
        <text x={m.l} y={H - 8}>
          TIGHT
        </text>
        <text x={W - m.r} y={H - 8} textAnchor="end">
          LOOSE →
        </text>
        <text x={m.l - 6} y={m.t + 4} transform={`rotate(-90 ${m.l - 6} ${m.t + 4})`} textAnchor="end">
          AGGRESSIVE →
        </text>
      </g>
      {signatures.map((s) => {
        const sx = x(looseness(s.stats));
        const sy = y(aggression(s.stats));
        return (
          <g key={s.id}>
            <circle cx={sx} cy={sy} r={s.id === 'gto' ? 5 : 3.5} fill={s.id === 'gto' ? 'none' : 'var(--color-ink-400)'} stroke="var(--color-ink-400)" strokeWidth="1.2" />
            <text x={sx + 9} y={sy + 3.5} fontSize="12" fill="var(--color-ink-300)">
              {STYLES[s.id]?.short ?? s.name}
            </text>
          </g>
        );
      })}
      <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: faint ? 0.45 : 1, scale: 1 }} style={{ transformOrigin: `${mx}px ${my}px` }}>
        <circle cx={mx} cy={my} r={halo} fill="var(--color-gold)" fillOpacity="0.12" stroke="var(--color-gold)" strokeOpacity="0.4" strokeDasharray="2 3" />
        <circle cx={mx} cy={my} r="6.5" fill="var(--color-gold)" />
        <text x={mx} y={my - halo - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-gold)">
          {label}
        </text>
      </motion.g>
    </svg>
  );
}

const cache: { key: string; result: CloneProgress | null } = { key: '', result: null };

/** A clone of your style plays the balanced bot and Otto; how much each wins shows how exploitable you are. */
function StressTest({ snap, cacheKey, whose }: { snap: OpponentSnapshot; cacheKey: string; whose: string }) {
  const [p, setP] = useState<CloneProgress | null>(cache.key === cacheKey ? cache.result : null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const run = () => {
    const w = worker.current;
    if (!w) return;
    setP(null);
    setError(null);
    const base = document.baseURI;
    w.postMessage({
      type: 'run',
      blueprintUrl: new URL('models/blueprint.json', base).href,
      exploitUrl: new URL('models/exploit.json', base).href,
      snapshot: snapRef.current,
      hands: SIM_HANDS,
      seed: (Math.random() * 1e6) | 0,
    } satisfies CloneIn);
  };

  useEffect(() => {
    const w = new CloneWorker();
    worker.current = w;
    w.onmessage = (e: MessageEvent<CloneOut>) => {
      const m = e.data;
      if (m.type === 'error') setError(m.message);
      else {
        setP(m);
        if (m.finished) {
          cache.key = cacheKey;
          cache.result = m;
        }
      }
    };
    if (cache.key !== cacheKey) run();
    return () => w.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <Locked text="Couldn't run the test" />;
  const running = !p || !p.finished;
  // Results from your side: what each bot wins is what you lose.
  const you = p ? { gto: -p.gto, otto: -p.otto } : null;
  const ottoWins = p ? p.otto * 100 : 0;
  const verdict = !p ? null : ottoWins < 10 ? { text: 'Hard to exploit', color: MARKS.Best.color } : ottoWins < 40 ? { text: 'Exploitable', color: MARKS.Inaccuracy.color } : { text: 'Very exploitable', color: MARKS.Blunder.color };
  const scale = you ? Math.max(0.3, Math.abs(you.gto), Math.abs(you.otto)) * 1.15 : 1;
  const mix = p?.weights
    .filter((w) => w.weight >= 0.1)
    .sort((a, b) => b.weight - a.weight)
    .map((w) => `${pct(w.weight)} ${STYLES[w.id]?.short ?? w.name}`)
    .join(' · ');

  return (
    <div className="border border-ink-600 p-5">
      <div className="flex min-h-[40px] items-baseline justify-between gap-3">
        <AnimatePresence mode="wait">
          {verdict && p?.finished ? (
            <motion.div key="v" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[28px] font-extrabold leading-none" style={{ color: verdict.color }}>
              {verdict.text}
            </motion.div>
          ) : (
            <motion.div key="r" exit={{ opacity: 0 }} className="font-mono text-[11px] tracking-[0.08em] text-ink-400">
              SIMULATING {p ? `${(p.done * 4).toLocaleString()} HANDS` : '…'}
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={run} disabled={running} className="font-mono text-[11px] tracking-[0.08em] text-ink-400 hover:text-ink-100 disabled:opacity-40">
          RUN AGAIN
        </button>
      </div>
      <p className="mt-2 text-[14px] text-ink-400">A clone of {whose} style played {(SIM_HANDS * 2).toLocaleString()} hands against each bot.</p>

      <div className="mt-5 flex flex-col gap-4">
        <ResultRow label="Vs balanced bot" value={you?.gto} se={p?.gtoSE} scale={scale} />
        <ResultRow label="Vs Otto, adapting" value={you?.otto} se={p?.ottoSE} scale={scale} accent />
      </div>

      <div className="mt-5 h-[2px] bg-ink-700">
        <motion.div className="h-full bg-ink-300" animate={{ width: `${p ? (p.done / p.total) * 100 : 0}%` }} transition={{ duration: 0.2 }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
        <span>Clone: {mix ?? '…'}</span>
        {p?.finished && <span>Otto gains {per100(p.otto - p.gto)} / 100 by adapting</span>}
      </div>
    </div>
  );
}

/** Your result per 100 hands as a bar from a centre line: losses left, wins right. */
function ResultRow({ label, value, se, scale, accent }: { label: string; value?: number; se?: number; scale: number; accent?: boolean }) {
  const w = value === undefined ? 0 : (Math.abs(value) / scale) * 50;
  const lose = (value ?? 0) < 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px]">{label}</span>
        <span className="tabular font-mono text-[15px] font-bold">
          {value === undefined ? '—' : per100(value)}
          <span className="ml-1 text-[11px] font-normal text-ink-500">/ 100 hands</span>
        </span>
      </div>
      <div className="relative mt-2 h-3 bg-ink-850">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-500" />
        <motion.span
          className="absolute inset-y-0"
          style={{ background: accent ? 'var(--color-gold)' : 'var(--color-ink-300)', [lose ? 'right' : 'left']: '50%' }}
          animate={{ width: `${w}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        />
      </div>
      {se !== undefined && value !== undefined && <div className="mt-1 text-right font-mono text-[10px] text-ink-500">±{per100(1.96 * se).replace(/^[+−]/, '')}</div>}
    </div>
  );
}

/** The habits Otto is using against you, biggest first. */
function Noticed({ snap }: { snap: OpponentSnapshot }) {
  const [all, setAll] = useState(false);
  const leaks = findLeaks(snap);
  const leakKeys = new Set(leaks.map((l) => l.key));
  const rows = all ? snap.stats.filter((s) => s.opps >= 3 && HABIT[s.key]).sort((a, b) => Number(leakKeys.has(b.key)) - Number(leakKeys.has(a.key))) : snap.stats.filter((s) => leakKeys.has(s.key)).sort((a, b) => Math.abs(b.mean - b.baseline) - Math.abs(a.mean - a.baseline)).slice(0, 4);
  return (
    <div>
      {rows.length === 0 ? (
        <p className="border border-ink-600 p-4 text-[15px] text-ink-300">No clear habits yet — you look balanced so far.</p>
      ) : (
        <div className="flex flex-col border border-ink-600">
          {rows.map((s, i) => {
            const leak = leaks.find((l) => l.key === s.key);
            return (
              <div key={s.key} className={`px-4 py-3.5 ${i ? 'border-t border-ink-700' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px]">{HABIT[s.key]}</span>
                  <span className="tabular font-mono text-[12px]">
                    <span className={leak ? 'text-gold' : 'text-ink-100'}>{pct(s.mean)}</span>
                    <span className="text-ink-500"> · typical {pct(s.baseline)}</span>
                  </span>
                </div>
                <div className="relative mt-2.5 h-2.5" aria-hidden="true">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-ink-600" />
                  <span className="absolute inset-y-0 w-px bg-ink-100" style={{ left: `${s.baseline * 100}%` }} />
                  <motion.span
                    className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${leak ? 'bg-gold' : 'bg-ink-300'}`}
                    initial={{ left: `${s.baseline * 100}%` }}
                    animate={{ left: `${s.mean * 100}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
                {leak && <p className="mt-2.5 text-[13.5px] leading-snug text-ink-300">{voice(leak.advice)}</p>}
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => setAll((v) => !v)} className="mt-2 font-mono text-[11px] tracking-[0.08em] text-ink-400 hover:text-ink-100">
        {all ? 'SHOW LESS' : 'ALL HABITS'}
      </button>
    </div>
  );
}

const MARK_ORDER: Mark[] = ['Brilliant', 'Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];

/** Session result, accuracy, and how many of each mark you earned. */
function Decisions({ history }: { history: ReturnType<typeof usePlay.getState>['history'] }) {
  const grades = history.flatMap((h) => h.grades);
  const net = history.reduce((a, h) => a + h.net, 0);
  const counts = new Map<Mark, number>();
  for (const g of grades) counts.set(markOf(g), (counts.get(markOf(g)) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  return (
    <div className="border border-ink-600 p-5">
      <div className="grid grid-cols-3">
        <Stat label="Hands" value={String(history.length)} />
        <Stat label="Result" value={signedMoney(net)} gold={net > 0} />
        <Stat label="Accuracy" value={grades.length ? accuracy(grades).toFixed(0) : '—'} />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {MARK_ORDER.map((mk) => {
          const c = counts.get(mk) ?? 0;
          return (
            <div key={mk} className="grid grid-cols-[22px_92px_1fr_28px] items-center gap-3">
              <MarkIcon mark={mk} size={20} />
              <span className="text-[13px]" style={{ color: c ? MARKS[mk].color : 'var(--color-ink-500)' }}>
                {MARKS[mk].text}
              </span>
              <span className="h-2 bg-ink-850">
                <motion.span className="block h-full" style={{ background: MARKS[mk].color }} initial={{ width: 0 }} animate={{ width: `${(c / max) * 100}%` }} />
              </span>
              <span className="tabular text-right font-mono text-[12px] text-ink-300">{c}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`tabular mt-1 font-mono text-[24px] font-bold leading-none ${gold ? 'text-gold' : ''}`}>{value}</div>
    </div>
  );
}
