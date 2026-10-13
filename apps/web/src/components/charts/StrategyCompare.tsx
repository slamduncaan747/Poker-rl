import { type Code } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { codeLabel, pct } from '../../lib/format';

interface Row {
  code: Code;
  to?: number;
  gto: number;
  final: number;
  chosen?: boolean;
}

/**
 * Paired horizontal bars: blueprint (GTO) probability vs the exploit-adjusted
 * probability for every available action.
 */
export function StrategyCompare({ rows, toCall, showFinal = true }: { rows: Row[]; toCall?: number; showFinal?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-300">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3  bg-ink-100" /> GTO blueprint
        </span>
        {showFinal && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3  bg-exploit" /> After exploit layer
          </span>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.code} className={`grid grid-cols-[96px_1fr] items-center gap-2 px-1.5 py-1 ${r.chosen ? 'bg-ink-800 ring-1 ring-gold/60' : ''}`}>
          <div className="truncate text-[12px] text-ink-200">
            {r.chosen && <span className="mr-1 text-gold">▸</span>}
            {codeLabel(r.code, r.to, toCall)}
          </div>
          <div className="flex flex-col gap-[3px]">
            <Bar value={r.gto} color="var(--color-gto)" />
            {showFinal && <Bar value={r.final} color="var(--color-exploit)" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[7px] flex-1 overflow-hidden bg-ink-700">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(value > 0 ? 1.5 : 0, value * 100)}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        />
      </div>
      <span className="tabular w-9 text-right font-mono text-[10.5px] text-ink-300">{pct(value)}</span>
    </div>
  );
}
