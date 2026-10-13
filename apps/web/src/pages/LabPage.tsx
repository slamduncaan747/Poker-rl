import { type Blueprint, CODE_LABELS, type Code, handClassCombos, handClassLabel } from '@poker-rl/engine';
import { useMemo, useState } from 'react';
import { CODE_COLORS } from '../components/table/ActionBar';
import { Panel, Segmented } from '../components/ui/Controls';
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
  { id: 'open', label: 'Button open', pos: 'B', hist: '', desc: 'Button (small blind) acts first preflop: fold, limp, or open-raise to 2bb / 3bb / all-in.' },
  { id: 'vs2', label: 'BB vs 2bb open', pos: 'O', hist: 'h', desc: 'Big blind facing a min-raise to 2bb.' },
  { id: 'vs3', label: 'BB vs 3bb open', pos: 'O', hist: 'p', desc: 'Big blind facing a pot-sized open to 3bb.' },
  { id: 'limp', label: 'BB vs limp', pos: 'O', hist: 'c', desc: 'Button completed the blind; big blind can check or raise.' },
  { id: '3bet', label: 'Button vs 3-bet', pos: 'B', hist: 'hp', desc: 'Button opened to 2bb and the big blind re-raised pot-size (to 6bb).' },
  { id: '4bet', label: 'BB vs 4-bet', pos: 'O', hist: 'hpp', desc: 'Big blind 3-bet and the button 4-bet.' },
  { id: 'shove', label: 'BB vs shove', pos: 'O', hist: 'a', desc: 'Button moved all-in for 100bb. Call or fold.' },
];

function strategyFor(bp: Blueprint, key: string) {
  return bp.raw(key);
}

export function LabPage() {
  const models = usePlay((s) => s.models);
  if (!models) return null;
  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-12 lg:px-6">
      <div className="mb-6 mt-2 max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Strategy <span className="text-gradient">Lab</span>
        </h1>
        <p className="mt-2 text-ink-300">
          Explore the equilibrium the bot computed with Monte Carlo CFR — {models.blueprint.file.meta.infosets.toLocaleString()} information sets trained
          over {(models.blueprint.file.meta.iterations / 1e6).toFixed(1)}M iterations. This is the <span className="text-gto-hi">GTO layer</span> that every
          exploit is a deviation from.
        </p>
      </div>
      <div className="flex flex-col gap-5">
        <PreflopExplorer bp={models.blueprint} />
        <PostflopExplorer bp={models.blueprint} />
      </div>
    </div>
  );
}

function Legend({ codes }: { codes: Code[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-300">
      {codes.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CODE_COLORS[c] }} />
          {CODE_LABELS[c]}
        </span>
      ))}
    </div>
  );
}

function PreflopExplorer({ bp }: { bp: Blueprint }) {
  const [sc, setSc] = useState(PREFLOP[0]);
  const [hover, setHover] = useState<number | null>(null);
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

  const hc = hover !== null ? cells[hover] : null;
  return (
    <Panel title="Preflop range explorer" right={<span className="text-[11px] text-ink-400">hover a hand for exact frequencies</span>}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PREFLOP.map((p) => (
          <button
            key={p.id}
            onClick={() => setSc(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${sc.id === p.id ? 'bg-gto/20 text-ink-100 ring-gto/50' : 'bg-white/[0.03] text-ink-400 ring-white/5 hover:text-ink-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,620px)_1fr]">
        <div>
          <div className="grid grid-cols-13 gap-[2px] rounded-xl bg-black/30 p-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }} onPointerLeave={() => setHover(null)}>
            {cells.map((cell, i) => (
              <div
                key={i}
                onPointerEnter={() => setHover(i)}
                className={`relative aspect-square overflow-hidden rounded-[3px] ${hover === i ? 'ring-2 ring-white' : ''}`}
                style={{ background: '#0a0e17' }}
              >
                {cell && (
                  <div className="absolute inset-0 flex flex-col-reverse">
                    {cell.map(({ c, p }) => (
                      <div key={c} style={{ height: `${p * 100}%`, background: CODE_COLORS[c] }} />
                    ))}
                  </div>
                )}
                <span className="absolute left-[3px] top-[1px] text-[9px] font-bold text-white/90 drop-shadow sm:text-[10.5px]">{handClassLabel(i)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Legend codes={codes} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-300">{sc.desc}</p>
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Overall range (combo-weighted)</div>
            <div className="flex h-4 overflow-hidden rounded-full">
              {codes.map((c) => (
                <div key={c} style={{ width: `${((totals.t[c] ?? 0) / totals.combos) * 100}%`, background: CODE_COLORS[c] }} className="border-r-2 border-ink-900 last:border-r-0" />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
              {codes.map((c) => (
                <div key={c} className="flex justify-between">
                  <span className="text-ink-300">{CODE_LABELS[c]}</span>
                  <span className="tabular font-mono text-ink-100">{pct((totals.t[c] ?? 0) / totals.combos, 1)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/5">
            {hover !== null ? (
              <>
                <div className="font-display text-2xl font-bold">{handClassLabel(hover)}</div>
                <div className="mb-3 text-[11px] text-ink-400">
                  {handClassCombos(hover)} combos · equity vs random {pct(bp.preflopEquity[hover])}
                </div>
                {hc ? (
                  hc.map(({ c, p }) => (
                    <div key={c} className="grid grid-cols-[80px_1fr_44px] items-center gap-2 py-0.5 text-[12px]">
                      <span className="text-ink-300">{CODE_LABELS[c]}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: CODE_COLORS[c] }} />
                      </div>
                      <span className="tabular text-right font-mono text-ink-100">{pct(p)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-ink-400">Not reached in training.</div>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-400">
                Mixed colours inside a cell are <em>mixed strategies</em>: the equilibrium randomises between actions with the same hand so it
                cannot be read. Notice the bluffs with weak suited hands mixed in with value hands.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

interface PostScenario {
  id: string;
  label: string;
  pos: 'B' | 'O';
  hist: string;
}

const POST: PostScenario[] = [
  { id: 'oop', label: 'OOP, first to act', pos: 'O', hist: '' },
  { id: 'ipk', label: 'IP, checked to', pos: 'B', hist: 'k' },
  { id: 'ipt', label: 'IP vs ⅓-pot bet', pos: 'B', hist: 't' },
  { id: 'iph', label: 'IP vs ½-pot bet', pos: 'B', hist: 'h' },
  { id: 'ipp', label: 'IP vs pot bet', pos: 'B', hist: 'p' },
  { id: 'oopkh', label: 'OOP check, faces ½-pot', pos: 'O', hist: 'kh' },
  { id: 'oopkp', label: 'OOP check, faces pot', pos: 'O', hist: 'kp' },
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
  const aggLabel = (a: string) => {
    const me = sc.pos === 'B' ? 'button' : 'big blind';
    return a === 'm' ? `${me} raised preflop` : a === 'o' ? `${me} called preflop` : 'limped pot';
  };
  return (
    <Panel title="Postflop strategy by hand strength">
      <p className="-mt-2 mb-4 max-w-3xl text-sm text-ink-300">
        Each column is a card-abstraction bucket — hands grouped by percentile of E[HS²] (flop/turn) or hand strength (river). Read left→right from
        air to the nuts: equilibrium play bets its strongest hands for value and a slice of its weakest as bluffs, checking the middle — a
        <em> polarised</em> strategy that emerges from CFR without ever being programmed.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={street} onChange={setStreet} options={[{ value: '1', label: 'Flop' }, { value: '2', label: 'Turn' }, { value: '3', label: 'River' }]} />
        <Segmented
          value={spr}
          onChange={setSpr}
          options={[
            { value: '4', label: 'Single-raised (SPR 12+)' },
            { value: '3', label: 'SPR 6–12' },
            { value: '2', label: '3-bet pot (SPR 3–6)' },
          ]}
        />
        <Segmented value={agg} onChange={setAgg} options={[{ value: 'm', label: 'Had initiative' }, { value: 'o', label: 'Opponent had it' }, { value: 'n', label: 'Nobody' }]} />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {POST.map((p) => (
          <button
            key={p.id}
            onClick={() => setSc(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${sc.id === p.id ? 'bg-gto/20 text-ink-100 ring-gto/50' : 'bg-white/[0.03] text-ink-400 ring-white/5 hover:text-ink-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-ink-400">Situation: {aggLabel(agg)} · previous street {agg === 'n' ? 'checked through' : 'had a bet'}</div>
      <div className="relative mt-2">
        <div className="flex h-[240px] items-end gap-[2px]" onPointerLeave={() => setHover(null)}>
          {cols.map((col, b) => (
            <div key={b} onPointerEnter={() => setHover(b)} className={`relative flex h-full flex-1 flex-col-reverse overflow-hidden rounded-t-[4px] ${hover === b ? 'ring-2 ring-white/80' : ''}`} style={{ background: col ? undefined : 'rgba(255,255,255,0.03)' }}>
              {col?.map(({ c, p }) => <div key={c} style={{ height: `${p * 100}%`, background: CODE_COLORS[c] }} />)}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-500">
          <span>← weakest hands</span>
          <span>hand-strength bucket</span>
          <span>strongest hands →</span>
        </div>
        {hover !== null && (
          <div className="glass pointer-events-none absolute top-2 z-10 rounded-lg px-3 py-2 text-[11px]" style={{ left: `${Math.min(80, (hover / n) * 100)}%` }}>
            <div className="font-semibold text-ink-100">
              Bucket {hover + 1}/{n} · ~{pct((hover + 0.5) / n)} percentile
            </div>
            {cols[hover] ? (
              cols[hover]!.map(({ c, p }) => (
                <div key={c} className="flex justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-ink-300">
                    <span className="h-2 w-2 rounded-sm" style={{ background: CODE_COLORS[c] }} />
                    {CODE_LABELS[c]}
                  </span>
                  <span className="tabular font-mono">{pct(p)}</span>
                </div>
              ))
            ) : (
              <div className="text-ink-400">Not reached in training</div>
            )}
          </div>
        )}
      </div>
      <div className="mt-3">
        <Legend codes={codes} />
      </div>
    </Panel>
  );
}
