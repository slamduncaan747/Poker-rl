import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/** A number that counts smoothly to its new value. */
export function Count({ value, format, duration = 0.6, delay = 0 }: { value: number; format: (v: number) => string; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const c = animate(from.current, value, { duration, delay, ease: 'easeOut', onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [value, duration, delay]);
  // whole dollars while counting, the exact value once it lands
  return <>{format(Math.abs(shown - value) < 1 ? value : Math.round(shown / 50) * 50)}</>;
}
