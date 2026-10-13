import { AnimatePresence, motion } from 'framer-motion';
import { bb } from '../../lib/format';

const DENOMS = [
  { v: 5000, fill: '#b91c1c', edge: '#fecaca' },
  { v: 1000, fill: '#ca8a04', edge: '#fef3c7' },
  { v: 500, fill: '#7e22ce', edge: '#e9d5ff' },
  { v: 100, fill: '#111827', edge: '#e5e7eb' },
  { v: 25, fill: '#1d4ed8', edge: '#dbeafe' },
];

export function Chip({ fill, edge, size = 22 }: { fill: string; edge: string; size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 40 25" className="block drop-shadow">
      <ellipse cx="20" cy="15" rx="18" ry="9" fill="#000" opacity="0.35" />
      <rect x="2" y="9" width="36" height="5" fill={fill} />
      <ellipse cx="20" cy="14" rx="18" ry="9" fill={fill} />
      <ellipse cx="20" cy="9" rx="18" ry="9" fill={fill} />
      <ellipse cx="20" cy="9" rx="18" ry="9" fill="none" stroke={edge} strokeWidth="3" strokeDasharray="5 6" />
      <ellipse cx="20" cy="9" rx="11" ry="5.5" fill="none" stroke={edge} strokeOpacity="0.6" strokeWidth="1" />
      <ellipse cx="20" cy="8" rx="16" ry="6" fill="#fff" opacity="0.08" />
    </svg>
  );
}

function breakdown(amount: number) {
  const cols: Array<{ fill: string; edge: string; n: number }> = [];
  let rest = amount;
  for (const d of DENOMS) {
    const n = Math.floor(rest / d.v);
    if (n > 0) {
      cols.push({ fill: d.fill, edge: d.edge, n: Math.min(n, 8) });
      rest -= n * d.v;
    }
    if (cols.length === 3) break;
  }
  if (cols.length === 0 && amount > 0) cols.push({ ...DENOMS[DENOMS.length - 1], n: 1 });
  return cols;
}

/** A stack of chips representing an amount, with its value in big blinds. */
export function ChipStack({ amount, label = true, size = 22, className = '' }: { amount: number; label?: boolean; size?: number; className?: string }) {
  const cols = breakdown(amount);
  return (
    <div className={`flex items-end gap-1.5 ${className}`}>
      <div className="flex items-end gap-[2px]">
        {cols.map((c, i) => (
          <div key={i} className="relative flex flex-col-reverse" style={{ height: size * 0.62 + (c.n - 1) * 4 }}>
            {Array.from({ length: c.n }).map((_, j) => (
              <div key={j} className="absolute left-0" style={{ bottom: j * 4 }}>
                <Chip fill={c.fill} edge={c.edge} size={size} />
              </div>
            ))}
            <div style={{ width: size }} />
          </div>
        ))}
      </div>
      {label && (
        <span className="tabular rounded-full bg-black/55 px-2 py-0.5 font-mono text-xs font-semibold text-amber-200 ring-1 ring-amber-300/20">
          {bb(amount)} bb
        </span>
      )}
    </div>
  );
}

/** A street bet in front of a seat that animates in and out. */
export function BetChips({ amount, id }: { amount: number; id: string }) {
  return (
    <AnimatePresence>
      {amount > 0 && (
        <motion.div
          key={id}
          initial={{ opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <ChipStack amount={amount} size={20} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
