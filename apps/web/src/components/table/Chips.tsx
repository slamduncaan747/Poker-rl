import { AnimatePresence, motion } from 'framer-motion';
import { bb } from '../../lib/format';

/** One drawn chip: an outlined ellipse with a hairline rim. */
export function Chip({ color = 'var(--color-ink-100)', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size * 0.42} viewBox="0 0 40 17" className="block" aria-hidden="true">
      <rect x="1" y="6" width="38" height="5" fill="var(--color-ink-950)" />
      <ellipse cx="20" cy="11" rx="19" ry="5.5" fill="var(--color-ink-950)" stroke={color} strokeWidth="1.5" />
      <line x1="1" y1="6" x2="1" y2="11" stroke={color} strokeWidth="1.5" />
      <line x1="39" y1="6" x2="39" y2="11" stroke={color} strokeWidth="1.5" />
      <ellipse cx="20" cy="6" rx="19" ry="5.5" fill="var(--color-ink-950)" stroke={color} strokeWidth="1.5" />
      <ellipse cx="20" cy="6" rx="10" ry="2.6" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}

/** Columns of chips: one per 10 bb, up to three columns of six. */
function columns(amount: number) {
  const units = Math.max(1, Math.min(18, Math.round(amount / 1000)));
  const cols: number[] = [];
  for (let left = units; left > 0; left -= 6) cols.push(Math.min(6, left));
  return cols;
}

/** A stack of drawn chips with its value in big blinds. */
export function ChipStack({
  amount,
  label = true,
  size = 22,
  color,
  className = '',
}: {
  amount: number;
  label?: boolean;
  size?: number;
  color?: string;
  className?: string;
}) {
  const cols = columns(amount);
  const step = 4;
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div className="flex items-end gap-[3px]">
        {cols.map((n, i) => (
          <div key={i} className="relative" style={{ width: size, height: size * 0.42 + (n - 1) * step }}>
            {Array.from({ length: n }).map((_, j) => (
              <div key={j} className="absolute left-0" style={{ bottom: j * step }}>
                <Chip size={size} color={color} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {label && (
        <span className="tabular font-mono text-[12px] font-medium tracking-wide" style={{ color: color ?? 'var(--color-ink-100)' }}>
          {bb(amount)}
        </span>
      )}
    </div>
  );
}

/** A street bet in front of a seat that animates in and out. */
export function BetChips({ amount, id, color, exitTo }: { amount: number; id: string; color?: string; exitTo?: { x: number; y: number } }) {
  return (
    <AnimatePresence>
      {amount > 0 && (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={exitTo ? { x: exitTo.x, y: exitTo.y, opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } } : { opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <ChipStack amount={amount} size={20} color={color} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
