import { type Blueprint, CODE_LABELS, type Code, handClassCombos, handClassLabel } from '@poker-rl/engine';
import { useMemo, useState } from 'react';
import { CODE_COLORS } from '../components/table/ActionBar';
import { Segmented } from '../components/ui/Controls';
import { pct } from '../lib/format';
import { usePlay } from '../lib/store';

const CODE_ORDER: Code[] = ['f', 'k', 'c', 't', 'h', 'p', 'a'];

interface PreflopScenario {
  id: string;
  label: string;
  pos: 'B' | 'O';
  hist: string;
  desc: string;
}

const PREFLOP: PreflopScenario[] = [
  { id: 'open', label: 'Button open', pos: 'B', hist: '', desc: 'Button (small blind) acts first preflop: fold, limp, or open-raise to $4 / $6 / all-in.' },
  { id: 'vs2', label: 'Big blind vs $4 open', pos: 'O', hist: 'h', desc: 'Big blind facing a min-raise to $4.' },
  { id: 'vs3', label: 'Big blind vs $6 open', pos: 'O', hist: 'p', desc: 'Big blind facing a pot-sized open to $6.' },
  { id: 'limp', label: 'Big blind vs limp', pos: 'O', hist: 'c', desc: 'Button completed the blind; big blind can check or raise.' },
  { id: '3bet', label: 'Button vs 3-bet', pos: 'B', hist: 'hp', desc: 'Button opened to $4 and the big blind re-raised pot-size (to $12).' },
  { id: '4bet', label: 'Big blind vs 4-bet', pos: 'O', hist: 'hpp', desc: 'Big blind 3-bet and the button 4-bet.' },
  { id: 'shove', label: 'Big blind vs shove', pos: 'O', hist: 'a', desc: 'Button moved all-in for $200. Call or fold.' },
];

function strategyFor(bp: Blueprint, key: string) {
  return bp.raw(key);
}

export function LabPage() {
  const models = usePlay((s) => s.models);
  if (!models) return null;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 lg:px-6">
      <div className="mb-6 mt-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Strategy Lab</h1>
        <p className="mt-2 font-mono text-[12px] tracking-[0.06em] text-ink-400">
          THE BALANCED STRATEGY · {(models.blueprint.file.meta.iterations / 1e6).toFixed(0)}M ITERATIONS · {models.blueprint.file.meta.infosets.toLocaleString()} SPOTS
        </p>
      </div>
      <div className="flex flex-col gap-6">
        <PreflopExplorer bp={models.blueprint} />
        <PostflopExplorer bp={models.blueprint} />
      </div>
    </div>
  );
}

function Legend({ codes }: { codes: Code[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-300">
      {codes.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5" style={{ background: CODE_COLORS[c], boxShadow: c === 'f' ? 'inset 0 0 0 1px #5a5f66' : undefined }} />
          {CODE_LABELS[c]}
        </span>
      ))}
    </div>
  );
}

function Tabs<T extends { id: string; label: string }>({ items, value, onChange, label }: { items: T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap border-b border-ink-100 font-mono text-[11px] uppercase tracking-[0.06em]">
      {items.map((p, i) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={value.id === p.id}
          onClick={() => onChange(p)}
          className={`min-h-[42px] px-3.5 transition ${i > 0 ? 'border-l border-ink-600' : ''} ${value.id === p.id ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const AKS = Array.from({ length: 169 }, (_, i) => i).find((i) => handClassLabel(i) === 'AKs') ?? 1;

function PreflopExplorer({ bp }: { bp: Blueprint }) {
  const [sc, setSc] = useState(PREFLOP[0]);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number>(AKS);
  const cells = useMemo(
    () =>
      Array.from({ length: 169 }, (_, i) => {
        const e = strategyFor(bp, `0${sc.pos}${i}:${sc.hist}`);
        return e ? CODE_ORDER.filter((c) => e.codes.includes(c)).map((c) => ({ c, p: e.probs[e.codes.indexOf(c)] })) : null;
      }),
    [bp, sc],
  );
  const codes = useMemo(() => CODE_ORDER.filter((c) => cells.some((x) => x?.some((y) => y.c === c && y.p > 0.005))), [cells]);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    let combos = 0;
    cells.forEach((cell, i) => {
      if (!cell) return;
      const w = handClassCombos(i);
      combos += w;
      for (const { c, p } of cell) t[c] = (t[c] ?? 0) + p * w;
    });
    return { t, combos };
  }, [cells]);

  const shown = hover ?? pinned;
  const hc = cells[shown];
  return (
    <section className="glass" aria-label="Preflop ranges">
      <Tabs items={PREFLOP} value={sc} onChange={setSc} label="Preflop spot" />
      <div className="grid gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(0,640px)_1fr]">
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <div className="grid min-w-[480px] gap-[2px] border border-ink-600 bg-ink-950 p-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }} onPointerLeave={() => setHover(null)}>
              {cells.map((cell, i) => (
                <button
                  key={i}
                  onPointerEnter={() => setHover(i)}
                  onClick={() => setPinned(i)}
                  aria-label={handClassLabel(i)}
                  className="relative aspect-square overflow-hidden bg-ink-950 p-0"
                >
                  {cell && (
                    <span className="absolute inset-0 flex flex-col-reverse">
                      {cell.map(({ c, p }) => (
                        <span key={c} className="block" style={{ height: `${p * 100}%`, background: CODE_COLORS[c] }} />
                      ))}
                    </span>
                  )}
                  <span className="absolute left-0 top-0 bg-ink-950/80 px-[3px] font-mono text-[9px] font-bold leading-[13px] text-ink-100 sm:text-[10px]">{handClassLabel(i)}</span>
                  {(pinned === i || hover === i) && <span className="absolute inset-0" style={{ boxShadow: 'inset 0 0 0 2px #121417, inset 0 0 0 3.5px var(--color-gold)' }} />}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <Legend codes={codes} />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="border border-ink-100">
            <div className="flex items-baseline justify-between border-b border-ink-600 px-4 py-3">
              <span className="text-[44px] font-extrabold leading-none">{handClassLabel(shown)}</span>
              <span className="text-right font-mono text-[10.5px] tracking-[0.06em] text-ink-400">
                {handClassCombos(shown)} COMBOS
                <br />
                {pct(bp.preflopEquity[shown])} VS RANDOM
              </span>
            </div>
            <div className="px-4 py-3">
              {hc ? (
                hc.map(({ c, p }) => (
                  <div key={c} className="grid grid-cols-[90px_1fr_44px] items-center gap-3 py-1 font-mono text-[11.5px]">
                    <span className="uppercase text-ink-300">{CODE_LABELS[c]}</span>
                    <span className="h-[6px] bg-ink-700">
                      <span className="block h-full" style={{ width: `${p * 100}%`, background: CODE_COLORS[c] }} />
                    </span>
                    <span className="tabular text-right">{pct(p)}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-[11px] text-ink-400">NOT REACHED IN TRAINING</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">WHOLE RANGE</div>
            <div className="flex h-3.5 border border-ink-500">
              {codes.map((c) => (
                <div key={c} title={`${CODE_LABELS[c]} ${pct((totals.t[c] ?? 0) / totals.combos, 1)}`} style={{ width: `${((totals.t[c] ?? 0) / totals.combos) * 100}%`, background: CODE_COLORS[c] }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] sm:grid-cols-3">
              {codes.map((c) => (
                <div key={c} className="flex justify-between">
                  <span className="uppercase text-ink-400">{CODE_LABELS[c]}</span>
                  <span className="tabular">{pct((totals.t[c] ?? 0) / totals.combos, 0)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="border-l-2 border-ink-500 pl-3 text-[13px] text-ink-400">{sc.desc}</p>
        </div>
      </div>
    </section>
  );
}

interface PostScenario {
  id: string;
  label: string;
  pos: 'B' | 'O';
  hist: string;
}

const POST: PostScenario[] = [
  { id: 'oop', label: 'OOP first', pos: 'O', hist: '' },
  { id: 'ipk', label: 'IP checked to', pos: 'B', hist: 'k' },
  { id: 'ipt', label: 'IP vs ⅓', pos: 'B', hist: 't' },
  { id: 'iph', label: 'IP vs ½', pos: 'B', hist: 'h' },
  { id: 'ipp', label: 'IP vs pot', pos: 'B', hist: 'p' },
  { id: 'oopkh', label: 'OOP x, vs ½', pos: 'O', hist: 'kh' },
  { id: 'oopkp', label: 'OOP x, vs pot', pos: 'O', hist: 'kp' },
];

function PostflopExplorer({ bp }: { bp: Blueprint }) {
  const [street, setStreet] = useState('1');
  const [sc, setSc] = useState(POST[0]);
  const [agg, setAgg] = useState('o');
  const [spr, setSpr] = useState('4');
  const [hover, setHover] = useState<number | null>(null);
  const n = bp.abstraction.buckets(Number(street));
  const cols = useMemo(
    () =>
      Array.from({ length: n }, (_, b) => {
        const e = bp.raw(`${street}${sc.pos}${b}:${spr}${agg}:${sc.hist}`);
        return e ? CODE_ORDER.filter((c) => e.codes.includes(c)).map((c) => ({ c, p: e.probs[e.codes.indexOf(c)] })) : null;
      }),
    [bp, street, sc, agg, spr, n],
  );
  const codes = CODE_ORDER.filter((c) => cols.some((x) => x?.some((y) => y.c === c && y.p > 0.005)));
  return (
    <section className="glass" aria-label="Postflop strategy by hand strength">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-2.5">
        <h2 className="font-mono text-[11px] font-normal tracking-[0.08em]">POSTFLOP · BY HAND STRENGTH</h2>
        <div className="flex flex-wrap gap-2">
          <Segmented value={street} onChange={setStreet} options={[{ value: '1', label: 'Flop' }, { value: '2', label: 'Turn' }, { value: '3', label: 'River' }]} />
          <Segmented value={spr} onChange={setSpr} options={[{ value: '4', label: 'SRP' }, { value: '3', label: 'SPR 6–12' }, { value: '2', label: '3-bet' }]} />
          <Segmented value={agg} onChange={setAgg} options={[{ value: 'm', label: 'My lead' }, { value: 'o', label: 'Their lead' }, { value: 'n', label: 'None' }]} />
        </div>
      </div>
      <Tabs items={POST} value={sc} onChange={setSc} label="Postflop spot" />
      <div className="relative p-4 sm:p-5">
        <div className="mb-3 flex justify-between font-mono text-[11px] tracking-[0.06em]" aria-hidden="true">
          <span className="flex items-center gap-2 text-gold">
            <span className="balloon">1</span>BLUFF
          </span>
          <span className="flex items-center gap-2 text-ink-400">
            <span className="balloon">2</span>CHECK
          </span>
          <span className="flex items-center gap-2 text-gold">
            <span className="balloon">3</span>VALUE
          </span>
        </div>
        <div className="flex h-[240px] items-end gap-[3px]" onPointerLeave={() => setHover(null)}>
          {cols.map((col, b) => (
            <div
              key={b}
              onPointerEnter={() => setHover(b)}
              className="relative flex h-full flex-1 flex-col-reverse overflow-hidden"
              style={{ background: col ? undefined : '#1c2024', boxShadow: hover === b ? '0 0 0 1.5px var(--color-gold)' : undefined }}
            >
              {col?.map(({ c, p }) => <div key={c} style={{ height: `${p * 100}%`, background: CODE_COLORS[c] }} />)}
            </div>
          ))}
        </div>
        <div className="ruler mt-1.5" aria-hidden="true" />
        <div className="mt-1 flex justify-between font-mono text-[10px] tracking-[0.06em] text-ink-500">
          <span>WEAK</span>
          <span>STRONG</span>
        </div>
        {hover !== null && (
          <div className="glass pointer-events-none absolute top-14 z-10 px-3 py-2 font-mono text-[11px]" style={{ left: `${Math.min(78, (hover / n) * 100)}%` }}>
            <div className="mb-1 text-ink-400">
              BUCKET {hover + 1}/{n}
            </div>
            {cols[hover] ? (
              cols[hover]!.map(({ c, p }) => (
                <div key={c} className="flex justify-between gap-4">
                  <span className="flex items-center gap-1.5 uppercase text-ink-300">
                    <span className="h-2 w-2" style={{ background: CODE_COLORS[c] }} />
                    {CODE_LABELS[c]}
                  </span>
                  <span className="tabular">{pct(p)}</span>
                </div>
              ))
            ) : (
              <div className="text-ink-400">NOT REACHED</div>
            )}
          </div>
        )}
        <div className="mt-4">
          <Legend codes={codes} />
        </div>
      </div>
    </section>
  );
}
