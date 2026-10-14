import type { EvalRow } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { CHIPS_PER_DOLLAR } from '../../lib/format';

/** Friendly names for the evaluation opponents. */
const NAMES: Record<string, string> = {
  'Calling Station': 'Calling station',
  Maniac: 'Maniac',
  Nit: 'Rock',
  'TAG Regular': 'Tight-aggressive',
  'LAG Aggro': 'Loose-aggressive',
  'Scared Money': 'Scared money',
  'Passive Fish': 'Loose-passive',
  'GTO Blueprint': 'Balanced bot',
};

/** bb/100 → $/100 at $1/$2 */
const usd = (bb100: number) => (bb100 * 100) / CHIPS_PER_DOLLAR;
const fmt = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(0)}`;

/**
 * Grouped horizontal bars: dollars won per 100 hands by the balanced AI and by
 * Otto against each opponent, with 95% confidence whiskers.
 */
export function EvalChart({ rows }: { rows: EvalRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = rows.map((r) => ({ name: NAMES[r.opponent] ?? r.opponent, gto: usd(r.gto), gtoCI: usd(r.gtoCI), otto: usd(r.exploit), ottoCI: usd(r.exploitCI) }));
  const max = Math.max(40, ...data.flatMap((r) => [Math.abs(r.gto) + r.gtoCI, Math.abs(r.otto) + r.ottoCI]));
  const min = Math.min(0, ...data.flatMap((r) => [r.gto - r.gtoCI, r.otto - r.ottoCI]));
  const lo = Math.min(min, -max * 0.05);
  const hi = max;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-300">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 bg-gto" /> Balanced AI
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 bg-exploit" /> Otto (adapts)
        </span>
        <span className="text-ink-500">whiskers = 95% CI</span>
      </div>
      <div className="flex flex-col gap-3">
        {data.map((r, i) => (
          <div key={r.name} className="grid grid-cols-[104px_1fr_64px] items-center gap-3 sm:grid-cols-[130px_1fr_72px]" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className={`text-[12.5px] ${hover === i ? 'text-ink-100' : 'text-ink-300'}`}>{r.name}</span>
            <div className="relative flex flex-col gap-[3px] py-0.5">
              <div className="absolute inset-y-0 w-px bg-ink-400/60" style={{ left: `${x(0)}%` }} />
              {[
                { v: r.gto, ci: r.gtoCI, c: 'var(--color-gto)' },
                { v: r.otto, ci: r.ottoCI, c: 'var(--color-exploit)' },
              ].map((b, j) => (
                <div key={j} className="relative h-[10px]">
                  <motion.div
                    className="absolute top-0 h-full"
                    style={{ left: `${x(Math.min(0, b.v))}%`, background: b.c, transformOrigin: b.v >= 0 ? 'left' : 'right' }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.abs(x(b.v) - x(0))}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: i * 0.05 + j * 0.1, ease: 'easeOut' }}
                  />
                  <div className="absolute top-1/2 h-px bg-ink-100/70" style={{ left: `${x(b.v - b.ci)}%`, width: `${x(b.v + b.ci) - x(b.v - b.ci)}%` }} />
                  <div className="absolute top-[1px] h-[8px] w-px bg-ink-100/70" style={{ left: `${x(b.v - b.ci)}%` }} />
                  <div className="absolute top-[1px] h-[8px] w-px bg-ink-100/70" style={{ left: `${x(b.v + b.ci)}%` }} />
                </div>
              ))}
            </div>
            <span className="tabular text-right font-mono text-[11px] leading-tight">
              <span className="block text-gto-hi">{fmt(r.gto)}</span>
              <span className="block text-exploit-hi">{fmt(r.otto)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-right font-mono text-[10px] uppercase tracking-[0.06em] text-ink-500">$ won per 100 hands · 30,000 hands each · duplicate format</div>
    </div>
  );
}
