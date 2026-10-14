import { type ReactNode } from 'react';

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
      <span>
        <span className="block text-sm text-ink-100">{label}</span>
        {hint && <span className="block text-[11px] text-ink-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 border transition ${checked ? 'border-gold bg-gold' : 'border-ink-500 bg-transparent'}`}
      >
        <span className={`absolute top-[3px] h-4 w-4 transition-all ${checked ? 'left-[23px] bg-ink-950' : 'left-[3px] bg-ink-400'}`} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex border border-ink-600 font-mono text-[11px] uppercase tracking-[0.06em]">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[34px] px-3 transition ${i > 0 ? 'border-l border-ink-600' : ''} ${value === o.value ? 'bg-ink-100 font-bold text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
