import type { EvalRow } from '@poker-rl/engine';
import { useState } from 'react';

/**
 * Grouped horizontal bars: win rate (bb/100) of the GTO blueprint and the
 * Exploit AI against each opponent, with 95% CI whiskers.
 */
export function EvalChart({ rows }: { rows: EvalRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(20, ...rows.flatMap((r) => [Math.abs(r.gto) + r.gtoCI, Math.abs(r.exploit) + r.exploitCI]));
  const min = Math.min(0, ...rows.flatMap((r) => [r.gto - r.gtoCI, r.exploit - r.exploitCI]));
  const lo = Math.min(min, -max * 0.05);
  const hi = max;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div>
      <div className="mb-3 flex gap-4 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-300">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3  bg-ink-100" /> Balanced AI (GTO)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3  bg-exploit" /> Adaptive AI (GTO + RL)
        </span>
        <span className="text-ink-500">whiskers = 95% CI</span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.opponent} className="grid grid-cols-[110px_1fr_92px] items-center gap-3" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className={`text-[12px] ${hover === i ? 'text-ink-100' : 'text-ink-300'}`}>{r.opponent}</span>
            <div className="relative flex flex-col gap-[3px] py-0.5">
              <div className="absolute inset-y-0 w-px bg-ink-400/60" style={{ left: `${x(0)}%` }} />
              {[
                { v: r.gto, ci: r.gtoCI, c: 'var(--color-gto)' },
                { v: r.exploit, ci: r.exploitCI, c: 'var(--color-exploit)' },
              ].map((b, j) => (
                <div key={j} className="relative h-[10px]">
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: `${x(Math.min(0, b.v))}%`,
                      width: `${Math.abs(x(b.v) - x(0))}%`,
                      background: b.c,
                      borderRadius: b.v >= 0 ? '0 4px 4px 0' : '4px 0 0 4px',
                    }}
                  />
                  <div className="absolute top-1/2 h-px bg-ink-100/70" style={{ left: `${x(b.v - b.ci)}%`, width: `${x(b.v + b.ci) - x(b.v - b.ci)}%` }} />
                  <div className="absolute top-[1px] h-[8px] w-px bg-ink-100/70" style={{ left: `${x(b.v - b.ci)}%` }} />
                  <div className="absolute top-[1px] h-[8px] w-px bg-ink-100/70" style={{ left: `${x(b.v + b.ci)}%` }} />
                </div>
              ))}
            </div>
            <span className="tabular text-right font-mono text-[11px] leading-tight">
              <span className="block text-gto-hi">{r.gto.toFixed(0)}</span>
              <span className="block text-exploit-hi">{r.exploit.toFixed(0)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-[10px] text-ink-500">bb / 100 hands, duplicate format</div>
    </div>
  );
}
