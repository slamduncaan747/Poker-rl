import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/** Renders children at a fixed design size and scales them to fit the available width. */
export function FitBox({ width, height, children, maxScale = 1.25, maxHeight }: { width: number; height: number; children: ReactNode; maxScale?: number; maxHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(maxScale, el.clientWidth / width, maxHeight ? maxHeight / height : Infinity));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [width, height, maxScale, maxHeight]);
  return (
    <div ref={ref} className="relative w-full" style={{ height: height * scale }}>
      <div className="absolute left-1/2 top-0 origin-top" style={{ width, height, transform: `translateX(-50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
