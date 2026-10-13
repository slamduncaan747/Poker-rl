import { useState } from 'react';

export interface RadarAxis {
  label: string;
  value: number; // 0..1
  baseline: number; // 0..1
  lo?: number;
  hi?: number;
  detail?: string;
}

/** Radar chart comparing an observed profile with the equilibrium baseline. */
export function RadarChart({ axes, size = 280, color = 'var(--color-exploit)', baseColor = 'var(--color-ink-100)', valueName = 'You', baseName = 'GTO' }: { axes: RadarAxis[]; size?: number; color?: string; baseColor?: string; valueName?: string; baseName?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const c = size / 2;
  const R = size / 2 - 42;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, Math.max(0.02, Math.min(1, v))).join(',')).join(' ');
  return (
    <div className="relative">
      <div className="mb-1 flex justify-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4" style={{ background: color }} /> {valueName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: baseColor }} /> {baseName}
        </span>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[340px]" role="img" aria-label="Player profile radar">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={poly(axes.map(() => r))} fill="none" stroke="#2a2e33" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2a2e33" />;
        })}
        <polygon points={poly(axes.map((a) => a.baseline))} fill="none" stroke={baseColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.9} />
        <polygon points={poly(axes.map((a) => a.value))} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = pt(i, Math.max(0.02, Math.min(1, a.value)));
          const [lx, ly] = pt(i, 1.2);
          return (
            <g key={a.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="cursor-default">
              <circle cx={x} cy={y} r={12} fill="transparent" />
              <rect x={x - (hover === i ? 4.5 : 3.5)} y={y - (hover === i ? 4.5 : 3.5)} width={hover === i ? 9 : 7} height={hover === i ? 9 : 7} fill={color} stroke="#15181b" strokeWidth={1.5} />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={hover === i ? '#e6e3dc' : '#8c929a'}>
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="glass pointer-events-none absolute left-1/2 top-8 z-10 -translate-x-1/2 px-3 py-2 text-[11px]">
          <div className="font-semibold text-ink-100">{axes[hover].label}</div>
          <div className="tabular font-mono text-ink-300">
            {valueName} {(axes[hover].value * 100).toFixed(0)}% · {baseName} {(axes[hover].baseline * 100).toFixed(0)}%
          </div>
          {axes[hover].detail && <div className="text-ink-400">{axes[hover].detail}</div>}
        </div>
      )}
    </div>
  );
}
