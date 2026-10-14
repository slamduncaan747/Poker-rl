import { useState } from 'react';

export interface Point {
  x: number;
  y: number;
  label?: string;
  accent?: boolean;
}

/** A square scatter plot with an optional y = x reference line and a hover readout. */
export function Scatter({ points, xLabel, yLabel, diagonal = true, format = (v) => v.toFixed(0) }: { points: Point[]; xLabel: string; yLabel: string; diagonal?: boolean; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const S = 320;
  const m = { l: 44, r: 12, t: 12, b: 38 };
  const lo = Math.min(0, ...points.flatMap((p) => [p.x, p.y]));
  const hiRaw = Math.max(...points.flatMap((p) => [p.x, p.y]));
  const step = hiRaw > 300 ? 100 : hiRaw > 120 ? 50 : 25;
  const hi = Math.ceil(hiRaw / step) * step;
  const sx = (v: number) => m.l + ((v - lo) / (hi - lo)) * (S - m.l - m.r);
  const sy = (v: number) => S - m.b - ((v - lo) / (hi - lo)) * (S - m.t - m.b);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[420px]" role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {ticks.map((t) => (
          <g key={t} className="font-mono" fontSize="9" fill="var(--color-ink-500)">
            <line x1={m.l} x2={S - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-ink-700)" />
            <text x={m.l - 6} y={sy(t) + 3} textAnchor="end">
              {format(t)}
            </text>
            <text x={sx(t)} y={S - m.b + 14} textAnchor="middle">
              {format(t)}
            </text>
          </g>
        ))}
        {diagonal && <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="var(--color-ink-400)" strokeDasharray="4 4" />}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={hover === i ? 6 : 4.5}
            fill={p.accent ? 'var(--color-gold)' : 'var(--color-ink-300)'}
            fillOpacity={0.85}
            stroke="var(--color-ink-950)"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
        <text x={(m.l + S - m.r) / 2} y={S - 6} textAnchor="middle" fontSize="10" fill="var(--color-ink-300)">
          {xLabel}
        </text>
        <text x={12} y={(m.t + S - m.b) / 2} textAnchor="middle" fontSize="10" fill="var(--color-ink-300)" transform={`rotate(-90 12 ${(m.t + S - m.b) / 2})`}>
          {yLabel}
        </text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute left-14 top-3 border border-ink-600 bg-ink-950 px-2 py-1 font-mono text-[10.5px] text-ink-200">
          {h.label ? `${h.label} · ` : ''}
          {format(h.x)} → {format(h.y)}
        </div>
      )}
    </div>
  );
}
