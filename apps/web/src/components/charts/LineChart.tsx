import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface Series {
  name: string;
  color: string;
  points: Array<[number, number]>;
  dashed?: boolean;
  /** optional confidence band around the line */
  band?: Array<[number, number, number]>;
}

interface Props {
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
  zeroLine?: boolean;
  logX?: boolean;
  empty?: string;
  /** a dimension line between the last points of two series, labelled (e.g. the gap between two win-rate curves) */
  bracket?: { a: number; b: number; label: string; sub?: string };
  /** show the series legend above the chart */
  legend?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Responsive SVG line chart with a crosshair tooltip and legend. */
export function LineChart({ series, height = 200, xLabel, yLabel, formatY = (v) => v.toFixed(1), formatX = (v) => `${Math.round(v)}`, zeroLine = true, logX = false, empty = 'No data yet', bracket, legend = true }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 46, r: bracket ? 78 : 14, t: 10, b: xLabel ? 34 : 22 };

  const all = series.flatMap((s) => s.points);
  const bands = series.flatMap((s) => s.band ?? []);
  const tx = (x: number) => (logX ? Math.log10(Math.max(1, x)) : x);
  const { x0, x1, y0, y1 } = useMemo(() => {
    if (all.length === 0) return { x0: 0, x1: 1, y0: -1, y1: 1 };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of all) {
      x0 = Math.min(x0, tx(x));
      x1 = Math.max(x1, tx(x));
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (const [, lo, hi] of bands) {
      y0 = Math.min(y0, lo);
      y1 = Math.max(y1, hi);
    }
    if (zeroLine) {
      y0 = Math.min(y0, 0);
      y1 = Math.max(y1, 0);
    }
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const py = (y1 - y0) * 0.08;
    return { x0, x1: x1 === x0 ? x0 + 1 : x1, y0: y0 - py, y1: y1 + py };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const sx = (x: number) => pad.l + ((tx(x) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const yTicks = niceTicks(y0, y1, 4);
  const xTicks = logX ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 1e5, 1e6].filter((v) => tx(v) >= x0 - 1e-9 && tx(v) <= x1 + 1e-9) : niceTicks(x0, x1, 5);

  const longest = series.reduce((a, s) => (s.points.length > a.length ? s.points : a), [] as Array<[number, number]>);

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg || longest.length === 0) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    longest.forEach(([x], i) => {
      const d = Math.abs(sx(x) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  if (all.length === 0) {
    return (
      <div ref={box} className="grid place-items-center border border-dashed border-ink-600 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-400" style={{ height }}>
        {empty}
      </div>
    );
  }

  const hx = hover !== null ? longest[hover]?.[0] : null;

  return (
    <div ref={box} className="relative">
      {legend && series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-300">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-2">
              <span className="inline-block w-5" style={{ borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${yLabel ?? ''} chart`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-ink-700)" />
            <text x={pad.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-400)" fontFamily="var(--font-mono)" className="tabular">
              {formatY(t)}
            </text>
          </g>
        ))}
        {zeroLine && y0 < 0 && y1 > 0 && <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="var(--color-ink-500)" />}
        {xTicks.filter((t, i, a) => i === 0 || formatX(logX ? a[i - 1] : a[i - 1]) !== formatX(logX ? t : t)).map((t) => (
          <text key={t} x={sx(t)} y={H - (xLabel ? 18 : 6)} textAnchor="middle" fontSize="10" fill="var(--color-ink-400)" fontFamily="var(--font-mono)" className="tabular">
            {formatX(logX ? t : t)}
          </text>
        ))}
        {xLabel && (
          <text x={(pad.l + W - pad.r) / 2} y={H - 3} textAnchor="middle" fontSize="10" fill="var(--color-ink-300)">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={(pad.t + H - pad.b) / 2} textAnchor="middle" fontSize="10" fill="var(--color-ink-300)" transform={`rotate(-90 10 ${(pad.t + H - pad.b) / 2})`}>
            {yLabel}
          </text>
        )}
        {series.map((s) =>
          s.band && s.band.length > 1 ? (
            <path
              key={`${s.name}-band`}
              d={
                s.band.map(([x, , hi], i) => `${i ? 'L' : 'M'}${sx(x)},${sy(hi)}`).join('') +
                s.band
                  .slice()
                  .reverse()
                  .map(([x, lo]) => `L${sx(x)},${sy(lo)}`)
                  .join('') +
                'Z'
              }
              fill={s.color}
              opacity={0.12}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {bracket && series[bracket.a]?.points.length > 1 && series[bracket.b]?.points.length > 1 && (() => {
          const pa = series[bracket.a].points[series[bracket.a].points.length - 1];
          const pb = series[bracket.b].points[series[bracket.b].points.length - 1];
          const xe = sx(Math.max(pa[0], pb[0]));
          const ya = sy(pa[1]);
          const yb = sy(pb[1]);
          const xl = xe + 22;
          const up = ya < yb ? 1 : -1;
          return (
            <g stroke="var(--color-ink-100)" strokeWidth={1} fill="none">
              <circle cx={sx(pa[0])} cy={ya} r={3.5} fill={series[bracket.a].color} stroke="none" />
              <circle cx={sx(pb[0])} cy={yb} r={3.5} fill={series[bracket.b].color} stroke="none" />
              <line x1={xe + 6} y1={ya} x2={xl + 6} y2={ya} />
              <line x1={xe + 6} y1={yb} x2={xl + 6} y2={yb} />
              {Math.abs(ya - yb) > 14 && (
                <>
                  <line x1={xl} y1={ya} x2={xl} y2={yb} />
                  <polyline points={`${xl - 3.5},${ya + 7 * up} ${xl},${ya} ${xl + 3.5},${ya + 7 * up}`} />
                  <polyline points={`${xl - 3.5},${yb - 7 * up} ${xl},${yb} ${xl + 3.5},${yb - 7 * up}`} />
                </>
              )}
              <text x={xl + 8} y={(ya + yb) / 2 + 2} fill="var(--color-gold)" stroke="none" fontSize="14" fontWeight="700" fontFamily="var(--font-mono)">
                {bracket.label}
              </text>
              {bracket.sub && (
                <text x={xl + 8} y={(ya + yb) / 2 + 16} fill="var(--color-ink-400)" stroke="none" fontSize="9.5" fontFamily="var(--font-mono)">
                  {bracket.sub}
                </text>
              )}
            </g>
          );
        })()}
        {hx !== null && hx !== undefined && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ink-500)" strokeDasharray="3 3" />
            {series.map((s) => {
              const p = s.points.find(([x]) => x === hx);
              return p ? <circle key={s.name} cx={sx(p[0])} cy={sy(p[1])} r={4.5} fill={s.color} stroke="var(--color-ink-900)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hx !== null && hx !== undefined && (
        <div
          className="glass pointer-events-none absolute top-6 z-10 min-w-[120px] px-2.5 py-1.5 font-mono text-[11px]"
          style={{ left: `${Math.min(70, Math.max(2, (sx(hx) / W) * 100))}%` }}
        >
          <div className="mb-0.5 text-ink-400">
            {xLabel ?? 'x'}: {formatX(hx)}
          </div>
          {series.map((s) => {
            const p = s.points.find(([x]) => x === hx);
            return p ? (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-ink-300">
                  <span className="h-2 w-2" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular font-mono text-ink-100">{formatY(p[1])}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
