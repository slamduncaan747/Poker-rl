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
export function LineChart({ series, height = 200, xLabel, yLabel, formatY = (v) => v.toFixed(1), formatX = (v) => `${Math.round(v)}`, zeroLine = true, logX = false, empty = 'No data yet' }: Props) {
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
  const pad = { l: 46, r: 14, t: 10, b: xLabel ? 34 : 22 };

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
  const xTicks = logX ? [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8].filter((v) => tx(v) >= x0 && tx(v) <= x1) : niceTicks(x0, x1, 5);

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
      <div ref={box} className="grid place-items-center rounded-xl border border-dashed border-white/10 text-xs text-ink-400" style={{ height }}>
        {empty}
      </div>
    );
  }

  const hx = hover !== null ? longest[hover]?.[0] : null;

  return (
    <div ref={box} className="relative">
      {series.length > 1 && (
        <div className="mb-1.5 flex flex-wrap gap-3 text-[11px] text-ink-300">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: s.color, opacity: s.dashed ? 0.7 : 1 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${yLabel ?? ''} chart`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgba(148,161,184,0.10)" />
            <text x={pad.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize="10" fill="#8c929a" className="tabular">
              {formatY(t)}
            </text>
          </g>
        ))}
        {zeroLine && y0 < 0 && y1 > 0 && <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="rgba(196,205,219,0.35)" />}
        {xTicks.map((t) => (
          <text key={t} x={sx(logX ? 10 ** t : t)} y={H - (xLabel ? 18 : 6)} textAnchor="middle" fontSize="10" fill="#8c929a" className="tabular">
            {formatX(logX ? t : t)}
          </text>
        ))}
        {xLabel && (
          <text x={(pad.l + W - pad.r) / 2} y={H - 3} textAnchor="middle" fontSize="10" fill="#abafb5">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={(pad.t + H - pad.b) / 2} textAnchor="middle" fontSize="10" fill="#abafb5" transform={`rotate(-90 10 ${(pad.t + H - pad.b) / 2})`}>
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
        {hx !== null && hx !== undefined && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={H - pad.b} stroke="rgba(230,235,242,0.3)" />
            {series.map((s) => {
              const p = s.points.find(([x]) => x === hx);
              return p ? <circle key={s.name} cx={sx(p[0])} cy={sy(p[1])} r={4.5} fill={s.color} stroke="#15181b" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hx !== null && hx !== undefined && (
        <div
          className="glass pointer-events-none absolute top-6 z-10 min-w-[120px] rounded-lg px-2.5 py-1.5 text-[11px]"
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
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
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
